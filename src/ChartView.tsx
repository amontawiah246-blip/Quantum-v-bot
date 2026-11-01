import React, { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:` : "") + `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
const decimalsFor = (p: number) => (p < 10 ? 5 : p < 1000 ? 3 : 2);

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartViewProps {
  wsBase: string;
  asset: string;
  tf: number;
  reloadKey: number;
}

export default function ChartView({ wsBase, asset, tf, reloadKey }: ChartViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"connecting" | "live" | "error">("connecting");
  const [msg, setMsg] = useState("");
  const [tickRate, setTickRate] = useState(0);

  useEffect(() => {
    setState("connecting"); 
    setMsg("");
    if (!box.current) return;

    const chart: IChartApi = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "#0a1020" }, textColor: "#7d89a8", fontSize: 12 },
      grid: { vertLines: { color: "#111a30" }, horzLines: { color: "#111a30" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: tf < 60, rightOffset: 8, barSpacing: 11, minBarSpacing: 3 },
    });

    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#22c55e", 
      downColor: "#ef4444", 
      wickUpColor: "#22c55e", 
      wickDownColor: "#ef4444",
      borderVisible: false, 
      lastValueVisible: false, 
      priceLineVisible: false,
    });

    // Use UTC+0 directly to align 1:1 with the broker chart's UTC+0 clock
    const conv = (c: Candle) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    });

    let last: Candle | null = null;
    let dec: number | null = null;
    let ticks = 0;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const setPrecision = (p: number) => {
      if (dec) return;
      dec = decimalsFor(p);
      series.applyOptions({ priceFormat: { type: "price", precision: dec, minMove: 1 / 10 ** dec } });
    };

    const place = () => {
      const el = pill.current;
      if (!el || !last) return;
      const y = series.priceToCoordinate(last.close);
      if (y == null) { el.style.display = "none"; return; }
      const left = tf - (Math.floor(Date.now() / 1000) % tf);
      el.style.display = "flex";
      el.style.top = `${y}px`;
      el.dataset.up = last.close >= last.open ? "1" : "0";
      if (el.children[0]) el.children[0].textContent = clock(left);
      if (el.children[1]) el.children[1].textContent = last.close.toFixed(dec ?? 5);
    };

    const ticker = setInterval(place, 250);
    const meter = setInterval(() => { setTickRate(ticks); ticks = 0; }, 1000);

    const open = () => {
      try {
        ws = new WebSocket(`${wsBase}/ws?asset=${encodeURIComponent(asset)}&tf=${tf}`);
        ws.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data);
            if (m.type === "history" && Array.isArray(m.candles) && m.candles.length) {
              // A refresh must never take away candles the chart already shows (that is how holes appeared).
              if (m.resync && last && m.candles[m.candles.length - 1].time < last.time) return;
              setPrecision(m.candles[m.candles.length - 1].close);
              series.setData(m.candles.map(conv));
              last = m.candles[m.candles.length - 1];
              if (!m.resync) {
                const len = m.candles.length;
                chart.timeScale().setVisibleLogicalRange({ from: len - 35, to: len + 4 });
              }
              setState("live");
              place();
            } else if (m.type === "tick") {
              setPrecision(m.price);
              if (last && m.candle.time < last.time) return; // stale tick for a candle that already closed
              if (!last) {
                series.setData([conv(m.candle)]);
              } else {
                series.update(conv(m.candle));
              }
              last = m.candle; 
              ticks++;
              setState("live"); 
              place();
            } else if (m.type === "error") {
              setState("error"); 
              setMsg(m.msg);
            } else if (m.type === "info") {
              setMsg(m.msg);
            }
          } catch {
            // ignore parsing error
          }
        };

        ws.onclose = () => { 
          if (!closed) { 
            setState("connecting"); 
            retry = setTimeout(open, 3000); 
          } 
        };

        ws.onerror = () => {
          if (!closed) {
            setState("connecting");
          }
        };
      } catch {
        if (!closed) {
          setState("connecting");
          retry = setTimeout(open, 3000);
        }
      }
    };

    open();

    return () => {
      closed = true; 
      clearTimeout(retry); 
      clearInterval(ticker); 
      clearInterval(meter);
      if (ws) ws.close(); 
      chart.remove();
    };
  }, [wsBase, asset, tf, reloadKey]);

  return (
    <div className="chart-wrap">
      <div ref={box} className="chart" />
      <div ref={pill} className="pill" style={{ display: "none" }}><span /><span /></div>
      {state !== "live" && (
        <div className="overlay">
          <b>{state === "error" ? "Bridge error" : "Waiting for live data"}</b>
          <span>{msg || `Connecting to ${wsBase}`}</span>
        </div>
      )}
      {state === "live" && (
        <div className="rate" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span>{tickRate} updates/s</span>
          <span style={{ color: "#7d89a8", borderLeft: "1px solid #1e293b", paddingLeft: "8px" }}>
            {new Date().toISOString().substring(11, 19)} UTC+0
          </span>
        </div>
      )}
    </div>
  );
}
