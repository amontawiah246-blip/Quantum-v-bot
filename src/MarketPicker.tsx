import React, { useMemo, useState, useEffect } from "react";
import Sheet from "./Sheet";
import MarketIcon from "./MarketIcon";
import { Asset, prettyName, groupOf } from "./assets";

interface MarketPickerProps {
  broker: string;
  assets: Asset[];
  currentAsset: string;
  onPick: (symbol: string) => void;
  onClose: () => void;
}

type TabType = "all" | "favs" | "currencies" | "crypto" | "commodities" | "derived";

const isDerivedSymbol = (s: string) =>
  s.startsWith("R_") ||
  s.startsWith("1HZ") ||
  s.startsWith("BOOM") ||
  s.startsWith("CRASH") ||
  s.startsWith("JD") ||
  s === "STPRNG" ||
  s === "RDBEAR" ||
  s === "RDBULL";

export default function MarketPicker({
  broker,
  assets,
  currentAsset,
  onPick,
  onClose,
}: MarketPickerProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabType>("all");

  // Load favorites for current broker from localStorage
  const favKey = `quantx_favs_${broker}`;
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(favKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFav = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavs((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      try {
        localStorage.setItem(favKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Determine if this broker has any Deriv-style derived markets
  const hasDerived = useMemo(
    () => assets.some((a) => isDerivedSymbol(a.symbol)),
    [assets]
  );

  // If user is on "derived" tab but broker has none, reset to "all"
  useEffect(() => {
    if (tab === "derived" && !hasDerived) {
      setTab("all");
    }
  }, [tab, hasDerived]);

  // Filter assets by search query and active tab
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assets.filter((a) => {
      const label = prettyName(a);
      const matchesSearch =
        !needle ||
        label.toLowerCase().includes(needle) ||
        a.symbol.toLowerCase().includes(needle);
      if (!matchesSearch) return false;

      if (tab === "all") return true;
      if (tab === "favs") return favs.includes(a.symbol);
      if (tab === "derived") return isDerivedSymbol(a.symbol);

      const g = groupOf(a).toLowerCase();
      if (tab === "currencies") return g.includes("currenc");
      if (tab === "crypto") return g.includes("crypto");
      if (tab === "commodities") return g.includes("commodit");
      return true;
    });
  }, [assets, q, tab, favs]);

  // Group filtered assets by their market group
  const groupedList = useMemo(() => {
    const map: Record<string, Asset[]> = {};
    for (const a of filtered) {
      const g = groupOf(a);
      if (!map[g]) map[g] = [];
      map[g].push(a);
    }
    return Object.entries(map).map(([group, items]) => ({
      group,
      items: items.sort(
        (x, y) =>
          (y.payout ?? 0) - (x.payout ?? 0) ||
          prettyName(x).localeCompare(prettyName(y))
      ),
    }));
  }, [filtered]);

  return (
    <Sheet title="Select Market" onClose={onClose}>
      <div className="mp-container">
        {/* Search Bar */}
        <div className="mp-search-wrap">
          <span className="mp-search-icon">🔍</span>
          <input
            className="mp-search-input"
            placeholder="Search pairs or symbols..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {q && (
            <button className="mp-clear-btn" onClick={() => setQ("")}>
              ✕
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="mp-tabs">
          <button
            className={`mp-tab ${tab === "all" ? "active" : ""}`}
            onClick={() => setTab("all")}
          >
            All
          </button>
          <button
            className={`mp-tab ${tab === "favs" ? "active" : ""}`}
            onClick={() => setTab("favs")}
          >
            ★ Favorites {favs.length > 0 && `(${favs.length})`}
          </button>
          {hasDerived && (
            <button
              className={`mp-tab derived ${tab === "derived" ? "active" : ""}`}
              onClick={() => setTab("derived")}
            >
              Derived
            </button>
          )}
          <button
            className={`mp-tab ${tab === "currencies" ? "active" : ""}`}
            onClick={() => setTab("currencies")}
          >
            Currencies
          </button>
          <button
            className={`mp-tab ${tab === "crypto" ? "active" : ""}`}
            onClick={() => setTab("crypto")}
          >
            Crypto
          </button>
          <button
            className={`mp-tab ${tab === "commodities" ? "active" : ""}`}
            onClick={() => setTab("commodities")}
          >
            Commodities
          </button>
        </div>

        {/* Market List */}
        <div className="mp-list">
          {assets.length === 0 ? (
            <div className="mp-empty">
              <p className="muted pad">Loading markets from bridge...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="mp-empty">
              <p className="muted pad">
                {tab === "favs"
                  ? "No favorite markets added yet. Click the star on any market to add it here."
                  : "No markets match your filter."}
              </p>
            </div>
          ) : (
            groupedList.map(({ group, items }) => (
              <div key={group} className="mp-group">
                <div className="mp-group-title">{group}</div>
                {items.map((a) => {
                  const isFav = favs.includes(a.symbol);
                  const isCurrent = a.symbol === currentAsset;
                  const label = prettyName(a);
                  const isLiveDeriv = a.payout == null || a.payout === 0;

                  return (
                    <div
                      key={a.symbol}
                      className={`mp-row ${isCurrent ? "current" : ""} ${
                        !a.active ? "disabled" : ""
                      }`}
                      onClick={() => {
                        if (a.active) {
                          onPick(a.symbol);
                          onClose();
                        }
                      }}
                    >
                      <button
                        className={`mp-star-btn ${isFav ? "favorited" : ""}`}
                        onClick={(e) => toggleFav(a.symbol, e)}
                        aria-label={isFav ? "Remove favorite" : "Add favorite"}
                      >
                        {isFav ? "★" : "☆"}
                      </button>

                      <div className="mp-icon-wrap">
                        <MarketIcon symbol={a.symbol} size={30} />
                      </div>

                      <div className="mp-info">
                        <div className="mp-name">{label}</div>
                        <div className="mp-symbol">{a.symbol}</div>
                      </div>

                      <div className="mp-payout-wrap">
                        {a.active ? (
                          isLiveDeriv ? (
                            <span className="mp-badge live">Live</span>
                          ) : (
                            <span className="mp-payout">{a.payout}%</span>
                          )
                        ) : (
                          <span className="mp-badge closed">Closed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}
