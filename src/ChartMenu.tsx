import React, { useState } from "react";
import Sheet from "./Sheet";

export type ChartType =
  | "Candles"
  | "Hollow candles"
  | "Bars"
  | "Heikin Ashi"
  | "Line"
  | "Area"
  | "Baseline";

interface ChartMenuProps {
  currentChartType: ChartType;
  onSelectChartType: (type: ChartType) => void;
  onResetChart: () => void;
  onScreenshot: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  livePrice?: number | null;
  candleTimer?: string | null;
  assetLabel?: string;
}

const CHART_TYPES: { id: ChartType; label: string; icon: string }[] = [
  { id: "Candles", label: "Candles", icon: "📊" },
  { id: "Hollow candles", label: "Hollow candles", icon: "🕯️" },
  { id: "Bars", label: "Bars", icon: "📶" },
  { id: "Heikin Ashi", label: "Heikin Ashi", icon: "📈" },
  { id: "Line", label: "Line", icon: "📉" },
  { id: "Area", label: "Area", icon: "🏔️" },
  { id: "Baseline", label: "Baseline", icon: "⚖️" },
];

export default function ChartMenu({
  currentChartType,
  onSelectChartType,
  onResetChart,
  onScreenshot,
  onToggleFullscreen,
  onClose,
  livePrice,
  candleTimer,
  assetLabel,
}: ChartMenuProps) {
  const [toast, setToast] = useState<string | null>(null);

  const showComingSoon = (feature: string) => {
    setToast(`${feature} is coming soon!`);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <Sheet title="Chart Options" onClose={onClose}>
      <div className="cm-container">
        {/* Toast notification for placeholders */}
        {toast && <div className="cm-toast">{toast}</div>}

        {/* Live Header Info Card */}
        <div className="cm-header-card">
          <div className="cm-header-left">
            <span className="cm-live-badge">
              <span className="cm-pulse-dot" /> LIVE
            </span>
            {assetLabel && <span className="cm-asset-name">{assetLabel}</span>}
          </div>
          <div className="cm-header-right">
            {livePrice != null && (
              <span className="cm-price">
                {livePrice < 10
                  ? livePrice.toFixed(5)
                  : livePrice < 1000
                  ? livePrice.toFixed(3)
                  : livePrice.toFixed(2)}
              </span>
            )}
            {candleTimer && (
              <span className="cm-timer" title="Candle close countdown">
                ⏱ {candleTimer}
              </span>
            )}
          </div>
        </div>

        {/* Chart Style Switcher */}
        <div className="cm-section">
          <div className="cm-section-title">CHART STYLE</div>
          <div className="cm-type-grid">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                className={`cm-type-btn ${
                  currentChartType === t.id ? "active" : ""
                }`}
                onClick={() => onSelectChartType(t.id)}
              >
                <span className="cm-type-icon">{t.icon}</span>
                <span className="cm-type-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Action Tiles */}
        <div className="cm-section">
          <div className="cm-section-title">TOOLS & ACTIONS</div>
          <div className="cm-action-grid">
            <button
              className="cm-action-tile"
              onClick={() => {
                onResetChart();
                onClose();
              }}
            >
              <span className="cm-action-icon">🔄</span>
              <span className="cm-action-name">Reset Chart</span>
              <span className="cm-action-sub">Restore zoom & scale</span>
            </button>

            <button
              className="cm-action-tile"
              onClick={() => {
                onScreenshot();
                onClose();
              }}
            >
              <span className="cm-action-icon">📸</span>
              <span className="cm-action-name">Screenshot</span>
              <span className="cm-action-sub">Save chart image</span>
            </button>

            <button
              className="cm-action-tile"
              onClick={() => {
                onToggleFullscreen();
                onClose();
              }}
            >
              <span className="cm-action-icon">⛶</span>
              <span className="cm-action-name">Fullscreen</span>
              <span className="cm-action-sub">Full screen view</span>
            </button>

            {/* Placeholder tiles */}
            <button
              className="cm-action-tile placeholder"
              onClick={() => showComingSoon("Technical Indicators")}
            >
              <span className="cm-action-icon">📊</span>
              <span className="cm-action-name">Indicators</span>
              <span className="cm-action-sub">Coming soon</span>
            </button>

            <button
              className="cm-action-tile placeholder"
              onClick={() => showComingSoon("Drawing Tools")}
            >
              <span className="cm-action-icon">✏️</span>
              <span className="cm-action-name">Drawings</span>
              <span className="cm-action-sub">Coming soon</span>
            </button>

            <button
              className="cm-action-tile placeholder"
              onClick={() => showComingSoon("Advanced Settings")}
            >
              <span className="cm-action-icon">⚙️</span>
              <span className="cm-action-name">Settings</span>
              <span className="cm-action-sub">Coming soon</span>
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
