import React, { useEffect, useMemo, useRef, useState } from "react";
import ChartView from "./ChartView";
import Sheet from "./Sheet";
import BrokerMenu from "./BrokerMenu";
import MarketPicker from "./MarketPicker";
import ChartMenu, { ChartType } from "./ChartMenu";
import ModePicker, { TradingMode } from "./ModePicker";
import MarketIcon from "./MarketIcon";
import { Home, Signals, Api, Menu, StatusData } from "./Pages";
import { prettyName, TIMEFRAMES, BROKERS, Asset } from "./assets";
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
  const [sheet, setSheet] = useState<string | null>(null); // broker | pair | tf | more | mode
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Chart Style State
  const [chartType, setChartType] = useState<ChartType>(() => {
    try {
      return (localStorage.getItem("quantx_chart_type") as ChartType) || "Candles";
    } catch {
      return "Candles";
    }
  });

  const handleSelectChartType = (type: ChartType) => {
    setChartType(type);
    try {
      localStorage.setItem("quantx_chart_type", type);
    } catch {
      // ignore
    }
  };

  // Trading Mode State
  const [tradingMode, setTradingMode] = useState<TradingMode>(() => {
    try {
      return (localStorage.getItem("quantx_mode") as TradingMode) || "classic";
    } catch {
      return "classic";
    }
  });

  const handleSelectMode = (mode: TradingMode) => {
    setTradingMode(mode);
    try {
      localStorage.setItem("quantx_mode", mode);
    } catch {
      // ignore
    }
  };

  // Live Chart Values for Header & ChartMenu
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [candleTimer, setCandleTimer] = useState<string | null>(null);

  const chartActionsRef = useRef<{
    resetChart: () => void;
    takeScreenshot: () => void;
    toggleFullscreen: () => void;
  } | null>(null);

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

  // Status + asset list (refresh periodically)
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
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [http, broker, status?.ready]);

  const current = assets.find((a) => a.symbol === asset);
  const label = current ? prettyName(current) : prettyName({ symbol: asset });
  const isDeriv = broker === "deriv";
  const tfLabel = TIMEFRAMES.find((t) => t.sec === tf)?.label;
  const brokerName = BROKERS.find((b) => b.id === broker)?.name || "Pocket Option";

  const close = () => {
    setSheet(null);
  };

  return (
    <div className="app">
      {tab === "chart" && (
        <header className="top">
          <button className="chip" onClick={() => setSheet("broker")}>
            {brokerName} ▾
          </button>
          <button className="chip pair" onClick={() => setSheet("pair")}>
            <MarketIcon symbol={asset} size={22} />
            <span className="pair-label">{label}</span>
            {current?.payout != null && current.payout > 0 ? (
              <em>{current.payout}%</em>
            ) : isDeriv ? (
              <em className="live-pill">Live</em>
            ) : null}
            <i>▾</i>
          </button>
          <button className="chip" onClick={() => setSheet("tf")}>
            {tfLabel} ▾
          </button>
          <button
            className="icon"
            onClick={() => setSheet("more")}
            aria-label="Chart Menu"
          >
            ⋯
          </button>
        </header>
      )}

      <main>
        {tab === "home" && (
          <Home
            status={status}
            brokerName={brokerName}
            onOpenChart={() => setTab("chart")}
          />
        )}
        {tab === "signals" && <Signals />}
        {tab === "chart" && (
          <ChartView
            wsBase={wsBase}
            broker={broker}
            asset={asset}
            tf={tf}
            reloadKey={reloadKey}
            chartType={chartType}
            tradingMode={tradingMode}
            onLiveUpdate={(p, t) => {
              setLivePrice(p);
              setCandleTimer(t);
            }}
            chartRef={chartActionsRef}
          />
        )}
        {tab === "api" && (
          <Api
            bridge={bridge}
            setBridge={setBridge}
            broker={broker}
            status={status}
          />
        )}
        {tab === "menu" && <Menu />}
      </main>

      <nav className="bottom">
        {[
          ["trades", "Trades", "↕"],
          ["signals", "Insights", "📶"],
        ].map(([id, name, ic]) => (
          <button
            key={id}
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            <span>{ic}</span>
            {name}
          </button>
        ))}

        {/* Glowing Mode Box */}
        <button
          className={`mode-glow-box ${tradingMode}`}
          onClick={() => setSheet("mode")}
          title="Select Trading Mode"
        >
          <span className="mode-glow-icon">
            {tradingMode === "classic" ? "🎛️" : tradingMode === "pro" ? "📈" : "🧠"}
          </span>
          <span className="mode-glow-label">
            {tradingMode === "classic" ? "Classic mode" : tradingMode === "pro" ? "Pro mode" : "AI Trader"}
          </span>
          <span className="mode-pulse-ring" />
        </button>

        {[
          ["social", "Social Trading", "👥"],
          ["menu", "More", "⋯"],
        ].map(([id, name, ic]) => (
          <button
            key={id}
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            <span>{ic}</span>
            {name}
          </button>
        ))}
      </nav>

      {/* Broker Selector Dropdown */}
      {sheet === "broker" && (
        <BrokerMenu
          current={broker}
          onPick={(id) => {
            setBroker(id);
            close();
          }}
          onClose={close}
        />
      )}

      {/* Advanced Market Selector with Tabs, Favorites, and Derived support */}
      {sheet === "pair" && (
        <MarketPicker
          broker={broker}
          assets={assets}
          currentAsset={asset}
          onPick={(sym) => {
            setAsset(sym);
            close();
          }}
          onClose={close}
        />
      )}

      {/* Timeframe Sheet */}
      {sheet === "tf" && (
        <Sheet title="Timeframe" onClose={close}>
          {TIMEFRAMES.map((t) => (
            <button
              key={t.sec}
              className={`item ${t.sec === tf ? "sel" : ""}`}
              onClick={() => {
                setTf(t.sec);
                close();
              }}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </Sheet>
      )}

      {/* Chart Three-Dots Menu */}
      {sheet === "more" && (
        <ChartMenu
          currentChartType={chartType}
          onSelectChartType={handleSelectChartType}
          onResetChart={() => {
            chartActionsRef.current?.resetChart();
            setReloadKey((k) => k + 1);
          }}
          onScreenshot={() => chartActionsRef.current?.takeScreenshot()}
          onToggleFullscreen={() =>
            chartActionsRef.current?.toggleFullscreen()
          }
          onClose={close}
          livePrice={livePrice}
          candleTimer={candleTimer}
          assetLabel={label}
        />
      )}

      {/* Glowing Mode Picker Sheet */}
      {sheet === "mode" && (
        <ModePicker
          currentMode={tradingMode}
          onSelectMode={handleSelectMode}
          onClose={close}
        />
      )}
    </div>
  );
}
