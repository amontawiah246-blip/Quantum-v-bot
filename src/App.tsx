import React, { useEffect, useMemo, useState } from "react";
import ChartView from "./ChartView";
import Sheet from "./Sheet";
import BrokerMenu from "./BrokerMenu";
import { Home, Signals, Api, Menu, StatusData } from "./Pages";
import { grouped, prettyName, TIMEFRAMES, BROKERS, Asset } from "./assets";
import "./styles.css";

const defaultBridge = () => {
  if (typeof window === "undefined") return "localhost:3000";
  const saved = localStorage.getItem("bridge");
  if (saved && !saved.includes(":8765")) {
    return saved;
  }
  return location.host;
};

export default function App() {
  const [tab, setTab] = useState("chart");
  const [bridge, setBridgeState] = useState(defaultBridge);
  const [broker, setBroker] = useState("pocket");
  const [asset, setAsset] = useState("EURUSD_otc");
  const [tf, setTf] = useState(60);
  const [sheet, setSheet] = useState<string | null>(null); // broker | pair | tf | more
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const setBridge = (v: string) => { 
    localStorage.setItem("bridge", v); 
    setBridgeState(v); 
  };

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const isLocal = bridge.includes("localhost") || bridge.includes("127.0.0.1");
  const httpProto = isHttps && !isLocal ? "https" : "http";
  const wsProto = isHttps && !isLocal ? "wss" : "ws";
  const http = bridge.startsWith("http") ? bridge : `${httpProto}://${bridge}`;
  const wsBase = bridge.startsWith("ws") ? bridge : `${wsProto}://${bridge}`;

  // Status + asset list (payouts change, so refresh every minute).
  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const sRes = await fetch(`${http}/api/status?broker=${broker}`);
        if (sRes.ok) {
          const s = await sRes.json();
          if (!dead) setStatus(s);
        } else if (!dead) {
          setStatus(null);
        }

        const aRes = await fetch(`${http}/api/assets?broker=${broker}`);
        if (aRes.ok) {
          const a = await aRes.json();
          if (!dead && Array.isArray(a)) {
            setAssets(a);
            if (a.length > 0 && !a.some((x) => x.symbol === asset)) {
              setAsset(a[0].symbol);
            }
          }
        }
      } catch { 
        if (!dead) setStatus(null); 
      }
    };
    load();
    const id = setInterval(load, status?.ready ? 60000 : 3000);
    return () => { dead = true; clearInterval(id); };
  }, [http, broker, status?.ready]);

  const current = assets.find((a) => a.symbol === asset);
  const label = current ? prettyName(current) : prettyName({ symbol: asset });
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? assets.filter((a) => (prettyName(a) + a.symbol).toLowerCase().includes(needle)) : assets;
    return grouped(list);
  }, [assets, q]);
  const tfLabel = TIMEFRAMES.find((t) => t.sec === tf)?.label;
  const brokerName = BROKERS.find((b) => b.id === broker)?.name || "Pocket Option";

  const close = () => { setSheet(null); setQ(""); };

  return (
    <div className="app">
      {tab === "chart" && (
        <header className="top">
          <button className="chip" onClick={() => setSheet("broker")}>{brokerName} ▾</button>
          <button className="chip pair" onClick={() => setSheet("pair")}>
            <span>{label}</span>
            {current?.payout != null && current.payout > 0 && <em>{current.payout}%</em>}
            <i>▾</i>
          </button>
          <button className="chip" onClick={() => setSheet("tf")}>{tfLabel} ▾</button>
          <button className="icon" onClick={() => setSheet("more")} aria-label="More">⋯</button>
        </header>
      )}

      <main>
        {tab === "home" && <Home status={status} brokerName={brokerName} onOpenChart={() => setTab("chart")} />}
        {tab === "signals" && <Signals />}
        {tab === "chart" && <ChartView wsBase={wsBase} broker={broker} asset={asset} tf={tf} reloadKey={reloadKey} />}
        {tab === "api" && <Api bridge={bridge} setBridge={setBridge} broker={broker} status={status} />}
        {tab === "menu" && <Menu />}
      </main>

      <nav className="bottom">
        {[
          ["home", "Home", "⌂"], 
          ["signals", "Signals", "∿"], 
          ["chart", "Chart", "▥"], 
          ["api", "API", "</>"], 
          ["menu", "Menu", "≡"]
        ].map(([id, name, ic]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <span>{ic}</span>
            {name}
          </button>
        ))}
      </nav>

      {sheet === "broker" && (
        <BrokerMenu current={broker} onPick={(id) => { setBroker(id); close(); }} onClose={close} />
      )}

      {sheet === "pair" && (
        <Sheet title="Pairs" onClose={close}>
          <input className="search" placeholder="Search pairs" value={q} onChange={(e) => setQ(e.target.value)} />
          {!assets.length && <p className="muted pad">Pairs load once the bridge is connected.</p>}
          {groups.map((g) => (
            <section key={g.group}>
              <h3>{g.group}</h3>
              {g.items.map((a) => (
                <button key={a.symbol} disabled={!a.active} className={`item ${a.symbol === asset ? "sel" : ""}`}
                  onClick={() => { setAsset(a.symbol); close(); }}>
                  <span>{a.label}</span>
                  <b>{a.active ? (a.payout != null && a.payout > 0 ? `${a.payout}%` : "Live") : "Closed"}</b>
                </button>
              ))}
            </section>
          ))}
        </Sheet>
      )}

      {sheet === "tf" && (
        <Sheet title="Timeframe" onClose={close}>
          {TIMEFRAMES.map((t) => (
            <button key={t.sec} className={`item ${t.sec === tf ? "sel" : ""}`} onClick={() => { setTf(t.sec); close(); }}>
              <span>{t.label}</span>
            </button>
          ))}
        </Sheet>
      )}

      {sheet === "more" && (
        <Sheet title="Chart" onClose={close}>
          <button className="item" onClick={() => { setReloadKey((k) => k + 1); close(); }}>
            <span>Reload chart data</span>
          </button>
          <p className="muted pad">Times show in your device&apos;s time zone.</p>
        </Sheet>
      )}
    </div>
  );
}
