import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

const BRIDGE = `ws://${location.hostname}:8000/ws`;
const TF = 60;

export default function LiveChart() {
  const box = useRef(null);
  const [asset, setAsset] = useState("EURUSD_otc");
  const [status, setStatus] = useState("connecting");
  const [price, setPrice] = useState(null);
  const [left, setLeft] = useState(TF);
  const [rate, setRate] = useState(0);
  const [log, setLog] = useState([]);

  useEffect(() => {
    const chart = createChart(box.current, {
      layout: { background: { color: "#0b1020" }, textColor: "#8b95ad" },
      grid: { vertLines: { color: "#141b30" }, horzLines: { color: "#141b30" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#1e2742" },
      rightPriceScale: { borderColor: "#1e2742" },
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444", borderVisible: false,
    });
    let ticks = 0;
    const meter = setInterval(() => { setRate(ticks); ticks = 0; }, 1000);
    const clock = setInterval(() => setLeft(TF - (Math.floor(Date.now() / 1000) % TF)), 250);

    const ws = new WebSocket(`${BRIDGE}?asset=${asset}&tf=${TF}`);
    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "history") series.setData(m.candles);
      else if (m.type === "tick") { ticks++; series.update(m.candle); setPrice(m.price); }
      else setLog((l) => [m.msg, ...l].slice(0, 4));
    };
    return () => { clearInterval(meter); clearInterval(clock); ws.close(); chart.remove(); };
  }, [asset]);

  const dot = status === "connected" ? "#22c55e" : "#ef4444";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", flexWrap: "wrap" }}>
        <input value={asset} onChange={(e) => setAsset(e.target.value)}
          style={{ background: "#141b30", color: "#fff", border: "1px solid #1e2742",
            borderRadius: 6, padding: "6px 8px", width: 130 }} />
        <span style={{ color: dot }}>● {status}</span>
        <b style={{ fontSize: 18, color: "#fff" }}>{price ?? "—"}</b>
        <span>{rate} updates/s</span>
        <span>candle closes in {left}s</span>
      </div>
      <div ref={box} style={{ flex: 1, minHeight: 0 }} />
      <div style={{ fontSize: 11, padding: "6px 14px", color: "#6b7694", wordBreak: "break-all" }}>
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
