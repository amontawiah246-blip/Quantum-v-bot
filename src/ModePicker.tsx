import React from "react";
import Sheet from "./Sheet";

export type TradingMode = "classic" | "pro" | "ai";

interface ModePickerProps {
  currentMode: TradingMode;
  onSelectMode: (mode: TradingMode) => void;
  onClose: () => void;
}

const MODES: {
  id: TradingMode;
  title: string;
  badge?: string;
  tagline: string;
  description: string;
  icon: string;
  gradient: string;
}[] = [
  {
    id: "classic",
    title: "Classic Mode",
    tagline: "Manual binary & options execution",
    description: "Real-time streaming chart with standard high/low order placement and instant execution.",
    icon: "⚡",
    gradient: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.05))",
  },
  {
    id: "pro",
    title: "Pro Mode",
    badge: "Coming Soon",
    tagline: "Multi-market analytical workspace",
    description: "Expanded order book, multi-chart layout, depth-of-market and advanced risk controls.",
    icon: "💎",
    gradient: "linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(126, 34, 206, 0.05))",
  },
  {
    id: "ai",
    title: "AI Trader",
    badge: "Coming Soon",
    tagline: "Autonomous neural pattern trading",
    description: "Algorithmic probability forecasting, automated strategy triggers, and predictive signals.",
    icon: "🧠",
    gradient: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.05))",
  },
];

export default function ModePicker({
  currentMode,
  onSelectMode,
  onClose,
}: ModePickerProps) {
  return (
    <Sheet title="Trading Mode" onClose={onClose}>
      <div className="modep-container">
        <p className="modep-desc">
          Choose your interface style and trading engine. Your preference is remembered automatically.
        </p>

        <div className="modep-cards">
          {MODES.map((m) => {
            const isSelected = currentMode === m.id;
            return (
              <div
                key={m.id}
                className={`modep-card ${isSelected ? "selected" : ""}`}
                style={{ background: isSelected ? m.gradient : undefined }}
                onClick={() => {
                  onSelectMode(m.id);
                  onClose();
                }}
              >
                <div className="modep-card-header">
                  <div className="modep-card-title-wrap">
                    <span className="modep-card-icon">{m.icon}</span>
                    <span className="modep-card-title">{m.title}</span>
                    {m.badge && <span className="modep-badge">{m.badge}</span>}
                  </div>
                  <div className="modep-radio">
                    {isSelected && <span className="modep-radio-dot" />}
                  </div>
                </div>

                <div className="modep-tagline">{m.tagline}</div>
                <div className="modep-text">{m.description}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
