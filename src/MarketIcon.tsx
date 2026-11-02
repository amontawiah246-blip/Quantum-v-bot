import React, { useState } from "react";

interface MarketIconProps {
  symbol: string;
  size?: number;
}

const CCY_TO_COUNTRY: Record<string, string> = {
  EUR: "eu",
  USD: "us",
  GBP: "gb",
  JPY: "jp",
  AUD: "au",
  CAD: "ca",
  CHF: "ch",
  NZD: "nz",
  TRY: "tr",
  AED: "ae",
  SAR: "sa",
  BRL: "br",
  INR: "in",
  MXN: "mx",
  ZAR: "za",
  SGD: "sg",
  HKD: "hk",
  CNH: "cn",
  PHP: "ph",
  IDR: "id",
  THB: "th",
  MYR: "my",
  VND: "vn",
  KRW: "kr",
  RUB: "ru",
  PLN: "pl",
  SEK: "se",
  NOK: "no",
  DKK: "dk",
  ILS: "il",
  CZK: "cz",
  HUF: "hu",
  ARS: "ar",
  COP: "co",
  CLP: "cl",
};

const CCY_COLORS: Record<string, string> = {
  EUR: "#1e3a8a",
  USD: "#14532d",
  GBP: "#701a75",
  JPY: "#831843",
  AUD: "#065f46",
  CAD: "#991b1b",
  CHF: "#991b1b",
  NZD: "#1e293b",
  TRY: "#b91c1c",
  BRL: "#15803d",
  INR: "#c2410c",
  MXN: "#15803d",
  ZAR: "#0f766e",
};

function FlagCircle({ ccy, size }: { ccy: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const country = CCY_TO_COUNTRY[ccy.toUpperCase()];
  const fallbackBg = CCY_COLORS[ccy.toUpperCase()] || "#1e293b";

  if (!country || failed) {
    return (
      <div
        className="flag-fallback"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: fallbackBg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.max(9, Math.floor(size * 0.42)),
          fontWeight: 700,
          border: "1.5px solid rgba(255,255,255,0.18)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          flexShrink: 0,
        }}
        title={ccy}
      >
        {ccy.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${country}.png`}
      alt={ccy}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: "1.5px solid rgba(255,255,255,0.18)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
    />
  );
}

export default function MarketIcon({ symbol, size = 32 }: MarketIconProps) {
  const sym = symbol.toUpperCase();

  // 1. Synthetic / Derived Indices (Boom, Crash, Volatility, Jump, Step, Range Bear/Bull)
  if (sym.startsWith("BOOM")) {
    const num = sym.replace("BOOM", "");
    const label = num === "1000" ? "B1K" : `B${num}`;
    return (
      <div
        className="coin-icon boom"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.floor(size * 0.36)) }}
      >
        <span>{label}</span>
      </div>
    );
  }

  if (sym.startsWith("CRASH")) {
    const num = sym.replace("CRASH", "");
    const label = num === "1000" ? "C1K" : `C${num}`;
    return (
      <div
        className="coin-icon crash"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.floor(size * 0.36)) }}
      >
        <span>{label}</span>
      </div>
    );
  }

  if (sym.startsWith("1HZ") || sym.startsWith("R_")) {
    const rawNum = sym.replace(/^1HZ/, "").replace(/^R_/, "").replace(/V$/, "");
    return (
      <div
        className="coin-icon vol"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.floor(size * 0.38)) }}
      >
        <span>{rawNum || "V"}</span>
      </div>
    );
  }

  if (sym.startsWith("JD")) {
    const rawNum = sym.replace("JD", "");
    return (
      <div
        className="coin-icon jump"
        style={{ width: size, height: size, fontSize: Math.max(9, Math.floor(size * 0.38)) }}
      >
        <span>{`J${rawNum}`}</span>
      </div>
    );
  }

  if (sym === "STPRNG") {
    return (
      <div
        className="coin-icon step"
        style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.32)) }}
      >
        <span>STP</span>
      </div>
    );
  }

  if (sym === "RDBEAR") {
    return (
      <div
        className="coin-icon bear"
        style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.32)) }}
      >
        <span>BEAR</span>
      </div>
    );
  }

  if (sym === "RDBULL") {
    return (
      <div
        className="coin-icon bull"
        style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.32)) }}
      >
        <span>BULL</span>
      </div>
    );
  }

  // 2. Crypto pairs (BTC, ETH, LTC, XRP, SOL, etc.)
  if (sym.startsWith("CRY") || /^(BTC|ETH|LTC|XRP|SOL|DOGE|ADA|DOT|BNB|AVAX|MATIC|LINK|TRX|TON|BCH|ATOM|UNI)/.test(sym.replace(/^#/, ""))) {
    let ticker = sym.replace(/^CRY/, "").replace(/_OTC$/, "").replace(/USD$/, "").replace(/^#/, "");
    if (!ticker) ticker = "CRY";
    const colors: Record<string, { bg: string; color: string; label: string }> = {
      BTC: { bg: "linear-gradient(135deg, #f7931a, #c76a00)", color: "#fff", label: "₿" },
      ETH: { bg: "linear-gradient(135deg, #627eea, #3b50ad)", color: "#fff", label: "Ξ" },
      LTC: { bg: "linear-gradient(135deg, #a6a9aa, #345d9d)", color: "#fff", label: "Ł" },
      XRP: { bg: "linear-gradient(135deg, #00aae4, #006097)", color: "#fff", label: "XRP" },
      SOL: { bg: "linear-gradient(135deg, #14f195, #9945ff)", color: "#fff", label: "SOL" },
      DOGE: { bg: "linear-gradient(135deg, #c2a633, #8a731b)", color: "#fff", label: "Ð" },
    };
    const c = colors[ticker] || { bg: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "#fff", label: ticker.slice(0, 3) };
    return (
      <div
        className="coin-icon crypto"
        style={{
          width: size,
          height: size,
          background: c.bg,
          color: c.color,
          fontSize: Math.max(9, Math.floor(size * (c.label.length > 2 ? 0.32 : 0.44))),
        }}
      >
        <span>{c.label}</span>
      </div>
    );
  }

  // 3. Commodities (Gold, Silver, Oil, Gas)
  if (sym.includes("XAU") || sym.includes("GOLD")) {
    return (
      <div className="coin-icon gold" style={{ width: size, height: size, fontSize: Math.floor(size * 0.32) }}>
        <span>XAU</span>
      </div>
    );
  }
  if (sym.includes("XAG") || sym.includes("SILV")) {
    return (
      <div className="coin-icon silver" style={{ width: size, height: size, fontSize: Math.floor(size * 0.32) }}>
        <span>XAG</span>
      </div>
    );
  }
  if (sym.includes("BRENT") || sym.includes("CRUDE") || sym.includes("XTI") || sym.includes("BRO")) {
    return (
      <div className="coin-icon oil" style={{ width: size, height: size, fontSize: Math.floor(size * 0.32) }}>
        <span>OIL</span>
      </div>
    );
  }

  // 4. Currency pairs with dual circular flags (e.g. EURUSD, GBPJPY, etc.)
  const clean = sym.replace(/^FRX/, "").replace(/^#/, "").replace(/_OTC$/, "");
  if (/^[A-Z]{6}$/.test(clean)) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    const circleSize = Math.floor(size * 0.72);
    return (
      <div
        className="dual-flag"
        style={{
          width: size,
          height: size,
          position: "relative",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}>
          <FlagCircle ccy={base} size={circleSize} />
        </div>
        <div style={{ position: "absolute", right: 0, bottom: 0, zIndex: 2 }}>
          <FlagCircle ccy={quote} size={circleSize} />
        </div>
      </div>
    );
  }

  // 5. Default generic badge
  return (
    <div
      className="coin-icon generic"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.floor(size * 0.34)),
      }}
    >
      <span>{clean.slice(0, 3)}</span>
    </div>
  );
}
