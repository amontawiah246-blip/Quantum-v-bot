import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import { BROKERS } from "./assets";
import { ChartType } from "./ChartMenu";
import { TradingMode } from "./ModePicker";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (s: number) =>
  (s >= 3600 ? `${Math.floor(s / 3600)}:` : "") +
  `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
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
  broker: string;
  asset: string;
  tf: number;
  reloadKey: number;
  chartType?: ChartType;
  tradingMode?: TradingMode;
  onLiveUpdate?: (price: number, timer: string) => void;
  chartRef?: React.MutableRefObject<{
    resetChart: () => void;
    takeScreenshot: () => void;
    toggleFullscreen: () => void;
  } | null>;
}

export default function ChartView({
  wsBase,
  broker,
  asset,
  tf,
  reloadKey,
  chartType = "Candles",
  tradingMode = "classic",
  onLiveUpdate,
  chartRef,
}: ChartViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<"connecting" | "live" | "error">(
    "connecting"
  );
  const [msg, setMsg] = useState("");
  const [tickRate, setTickRate] = useState(0);

  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const lastCandleRef = useRef<Candle | null>(null);
  const precisionRef = useRef<number | null>(null);

  // Helper to convert internal Candle to format required by current series type
  const formatCandleData = (c: Candle, prevHa?: { open: number; close: number }) => {
    const time = c.time as UTCTimestamp;
    if (chartType === "Line" || chartType === "Area" || chartType === "Baseline") {
      return { time, value: c.close };
    }
    if (chartType === "Heikin Ashi") {
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen = prevHa ? (prevHa.open + prevHa.close) / 2 : (c.open + c.close) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);
      return { time, open: haOpen, high: haHigh, low: haLow, close: haClose };
    }
    return {
      time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    };
  };

  const createSeriesForType = (chart: IChartApi, type: ChartType) => {
    switch (type) {
      case "Hollow candles":
        return chart.addCandlestickSeries({
          upColor: "transparent",
          downColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
          borderVisible: true,
          borderUpColor: "#22c55e",
          borderDownColor: "#ef4444",
          lastValueVisible: false,
          priceLineVisible: false,
        });

      case "Bars":
        return chart.addBarSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          lastValueVisible: false,
          priceLineVisible: false,
        });

      case "Line":
        return chart.addLineSeries({
          color: "#3b82f6",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });

      case "Area":
        return chart.addAreaSeries({
          topColor: "rgba(59, 130, 246, 0.4)",
          bottomColor: "rgba(59, 130, 246, 0.02)",
          lineColor: "#3b82f6",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });

      case "Baseline":
        return chart.addBaselineSeries({
          topLineColor: "#22c55e",
          topFillColor1: "rgba(34, 197, 94, 0.28)",
          topFillColor2: "rgba(34, 197, 94, 0.05)",
          bottomLineColor: "#ef4444",
          bottomFillColor1: "rgba(239, 68, 68, 0.05)",
          bottomFillColor2: "rgba(239, 68, 68, 0.28)",
          lastValueVisible: false,
          priceLineVisible: false,
        });

      case "Heikin Ashi":
      case "Candles":
      default:
        return chart.addCandlestickSeries({
          upColor: "#22c55e",
          downColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
          borderVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
    }
  };

  // Re-create or switch series when chartType changes without resetting chart/websocket
  useEffect(() => {
    const chart = chartApiRef.current;
    if (!chart) return;

    if (seriesRef.current) {
      try {
        chart.removeSeries(seriesRef.current);
      } catch {
        // ignore
      }
    }

    const newSeries = createSeriesForType(chart, chartType);
    seriesRef.current = newSeries;

    if (precisionRef.current != null) {
      const dec = precisionRef.current;
      newSeries.applyOptions({
        priceFormat: { type: "price", precision: dec, minMove: 1 / 10 ** dec },
      });
    }

    // Populate with existing candles
    if (candlesRef.current.length > 0) {
      const raw = candlesRef.current;
      let prevHa: { open: number; close: number } | undefined;
      const formatted = raw.map((c) => {
        const item = formatCandleData(c, prevHa);
        if (chartType === "Heikin Ashi" && "open" in item && "close" in item && typeof item.open === "number" && typeof item.close === "number") {
          prevHa = { open: item.open, close: item.close };
        }
        return item;
      });
      newSeries.setData(formatted);
    }
  }, [chartType]);

  // Imperative chart actions for ChartMenu
  useEffect(() => {
    if (!chartRef) return;
    chartRef.current = {
      resetChart: () => {
        if (!chartApiRef.current) return;
        chartApiRef.current.timeScale().resetTimeScale();
        chartApiRef.current.priceScale("right").applyOptions({ autoScale: true });
        if (candlesRef.current.length > 0) {
          const len = candlesRef.current.length;
          chartApiRef.current.timeScale().setVisibleLogicalRange({
            from: len - 35,
            to: len + 4,
          });
        }
      },
      takeScreenshot: () => {
        if (!chartApiRef.current) return;
        try {
          const canvas = chartApiRef.current.takeScreenshot();
          const url = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.download = `quantx-${broker}-${asset}-${Date.now()}.png`;
          a.href = url;
          a.click();
        } catch {
          // fallback
        }
      },
      toggleFullscreen: () => {
        if (!wrapRef.current) return;
        if (!document.fullscreenElement) {
          wrapRef.current.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      },
    };
  }, [chartRef, broker, asset]);

  // Main lifecycle for Chart and WebSocket
  useEffect(() => {
    setState("connecting");
    setMsg("");
    candlesRef.current = [];
    lastCandleRef.current = null;
    precisionRef.current = null;

    if (!box.current) return;

    const chart: IChartApi = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: "#0a1020" },
        textColor: "#7d89a8",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#111a30" },
        horzLines: { color: "#111a30" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: tf < 60,
        rightOffset: 8,
        barSpacing: 11,
        minBarSpacing: 3,
      },
    });

    chartApiRef.current = chart;
    const series = createSeriesForType(chart, chartType);
    seriesRef.current = series;

    let ticks = 0;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const setPrecision = (p: number) => {
      if (precisionRef.current != null) return;
      const dec = decimalsFor(p);
      precisionRef.current = dec;
      seriesRef.current?.applyOptions({
        priceFormat: { type: "price", precision: dec, minMove: 1 / 10 ** dec },
      });
    };

    const place = () => {
      const el = pill.current;
      const last = lastCandleRef.current;
      if (!el || !last) return;
      const y = seriesRef.current?.priceToCoordinate(last.close);
      if (y == null) {
        el.style.display = "none";
        return;
      }
      const left = tf - (Math.floor(Date.now() / 1000) % tf);
      const timerStr = clock(left);
      el.style.display = "flex";
      el.style.top = `${y}px`;
      el.dataset.up = last.close >= last.open ? "1" : "0";
      if (el.children[0]) el.children[0].textContent = timerStr;
      if (el.children[1])
        el.children[1].textContent = last.close.toFixed(
          precisionRef.current ?? 5
        );

      // Notify parent for ChartMenu header
      onLiveUpdate?.(last.close, timerStr);
    };

    const ticker = setInterval(place, 250);
    const meter = setInterval(() => {
      setTickRate(ticks);
      ticks = 0;
    }, 1000);

    const open = () => {
      try {
        ws = new WebSocket(
          `${wsBase}/ws?broker=${encodeURIComponent(
            broker
          )}&asset=${encodeURIComponent(asset)}&tf=${tf}`
        );

        ws.onmessage = (e) => {
          if (closed) return;
          try {
            const m = JSON.parse(e.data);
            if (
              m.type === "history" &&
              Array.isArray(m.candles) &&
              m.candles.length
            ) {
              const last = lastCandleRef.current;
              if (
                m.resync &&
                last &&
                m.candles[m.candles.length - 1].time < last.time
              )
                return;

              const latestClose = m.candles[m.candles.length - 1].close;
              setPrecision(latestClose);

              candlesRef.current = m.candles;
              lastCandleRef.current = m.candles[m.candles.length - 1];

              let prevHa: { open: number; close: number } | undefined;
              const formatted = m.candles.map((c: Candle) => {
                const item = formatCandleData(c, prevHa);
                if (
                  chartType === "Heikin Ashi" &&
                  "open" in item &&
                  "close" in item &&
                  typeof item.open === "number" &&
                  typeof item.close === "number"
                ) {
                  prevHa = { open: item.open, close: item.close };
                }
                return item;
              });

              seriesRef.current?.setData(formatted);

              if (!m.resync) {
                const len = m.candles.length;
                chart
                  .timeScale()
                  .setVisibleLogicalRange({ from: len - 35, to: len + 4 });
              }
              setState("live");
              place();
            } else if (m.type === "tick") {
              setPrecision(m.price);
              const last = lastCandleRef.current;
              if (last && m.candle.time < last.time) return;

              if (!last) {
                candlesRef.current = [m.candle];
                seriesRef.current?.setData([formatCandleData(m.candle)]);
              } else {
                // Update candle in list
                const existingIdx = candlesRef.current.findIndex(
                  (c) => c.time === m.candle.time
                );
                if (existingIdx !== -1) {
                  candlesRef.current[existingIdx] = m.candle;
                } else {
                  candlesRef.current.push(m.candle);
                }
                seriesRef.current?.update(formatCandleData(m.candle));
              }
              lastCandleRef.current = m.candle;
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
      chartApiRef.current = null;
      seriesRef.current = null;
    };
  }, [wsBase, broker, asset, tf, reloadKey]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      <div ref={box} className="chart" />
      <div ref={pill} className="pill" style={{ display: "none" }}>
        <span />
        <span />
      </div>

      {/* Floating Mode Badge (Pro Mode or AI Trader) */}
      {tradingMode !== "classic" && (
        <div className={`mode-chart-badge ${tradingMode}`}>
          {tradingMode === "pro" ? "💎 Pro Mode (Coming Soon)" : "🧠 AI Trader (Coming Soon)"}
        </div>
      )}

      {state !== "live" && (
        <div className="overlay">
          <b>{state === "error" ? "Bridge error" : "Waiting for live data"}</b>
          <span>
            {msg ||
              `Connecting to ${
                BROKERS.find((b) => b.id === broker)?.name || broker
              }...`}
          </span>
        </div>
      )}

      {state === "live" && (
        <div
          className="rate"
          style={{ display: "flex", gap: "12px", alignItems: "center" }}
        >
          <span>{tickRate} updates/s</span>
          <span
            style={{
              color: "#7d89a8",
              borderLeft: "1px solid #1e293b",
              paddingLeft: "8px",
            }}
          >
            {new Date().toISOString().substring(11, 19)} UTC+0
          </span>
        </div>
      )}
    </div>
  );
}
