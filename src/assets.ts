// Turn Pocket Option symbols into grouped, readable pairs.
const CCY = ["USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","TRY","AED","SAR","NGN","ZAR","MXN","BRL","INR","CNH","HKD","SGD","THB","IDR","PHP","EGP","DZD","MAD","TND","LBP","YER","QAR","BHD","OMR","JOD","KES","UAH","RUB","ARS","COP","BDT","PKR","SEK","NOK","DKK","PLN","CZK","HUF","ILS"];
const CRYPTO = ["BTC","ETH","LTC","XRP","BNB","DOGE","SOL","ADA","DOT","MATIC","AVAX","LINK","TRX","TON","BCH","ATOM","UNI","SHIB","PEPE","DASH","ZEC","EOS"];
const METALS_ENERGY = ["XAU","XAG","XPT","XPD","UKBRENT","USCRUDE","BRENT","XNG","NGAS"];

export interface Asset {
  symbol: string;
  name?: string | null;
  payout?: number | null;
  active?: boolean;
  label?: string;
}

export function prettyName(a: Asset): string {
  if (a.name) return a.name;
  let sym = a.symbol;
  if (sym.startsWith("frx")) sym = sym.slice(3);
  if (sym.startsWith("cry")) sym = sym.slice(3);
  const base = sym.replace(/^#/, "").replace(/_otc$/i, "");
  const otc = /_otc$/i.test(a.symbol) ? " OTC" : "";
  if (/^[A-Z]{6}$/.test(base) && CCY.includes(base.slice(0, 3)) && CCY.includes(base.slice(3)))
    return `${base.slice(0, 3)}/${base.slice(3)}${otc}`;
  if (/^[A-Z]{3,5}USD$/.test(base) && CRYPTO.includes(base.slice(0, -3)))
    return `${base.slice(0, -3)}/USD${otc}`;
  return base + otc;
}

export function groupOf(a: Asset): string {
  const sym = a.symbol;
  if (sym.startsWith("R_") || sym.startsWith("1HZ") || sym.startsWith("BOOM") || sym.startsWith("CRASH") || sym.startsWith("JD") || sym === "STPRNG" || sym === "RDBEAR" || sym === "RDBULL") {
    return "Derived Indices";
  }
  if (sym.startsWith("frxXAU") || sym.startsWith("frxXAG") || sym.startsWith("frxXPD") || sym.startsWith("frxXPT") || sym.startsWith("frxBRO") || sym.startsWith("frxXTI")) {
    return "Commodities";
  }
  if (sym.startsWith("cry") || CRYPTO.some((c) => sym.toUpperCase().includes(c))) {
    return "Crypto";
  }
  if (sym.startsWith("frx") || (/^[A-Z]{6}$/.test(sym) && CCY.includes(sym.slice(0, 3)))) {
    return "Currencies";
  }
  const otc = /_otc$/i.test(sym) ? " OTC" : "";
  const base = sym.replace(/^#/, "").replace(/_otc$/i, "").toUpperCase();
  if (sym.startsWith("#")) return "Stocks" + otc;
  if (METALS_ENERGY.some((c) => base.startsWith(c))) return "Commodities" + otc;
  if (/^[A-Z]{6}$/.test(base) && CCY.includes(base.slice(0, 3))) return "Currencies" + otc;
  return "Indices & other" + otc;
}

const ORDER = [
  "Derived Indices", "Currencies", "Commodities", "Crypto", "Stocks", "Indices & other",
  "Currencies OTC", "Crypto OTC", "Commodities OTC", "Stocks OTC", "Indices & other OTC"
];

export interface GroupedAssets {
  group: string;
  items: Asset[];
}

export function grouped(list: Asset[]): GroupedAssets[] {
  const map: Record<string, Asset[]> = {};
  for (const a of list) {
    const g = groupOf(a);
    if (!map[g]) map[g] = [];
    map[g].push({ ...a, label: prettyName(a) });
  }
  return ORDER.filter((g) => map[g]).map((g) => ({
    group: g,
    items: map[g].sort((x, y) => (y.payout ?? 0) - (x.payout ?? 0) || (x.label || "").localeCompare(y.label || "")),
  }));
}

export const TIMEFRAMES = [
  { label: "5s", sec: 5 }, { label: "15s", sec: 15 }, { label: "30s", sec: 30 },
  { label: "1m", sec: 60 }, { label: "5m", sec: 300 }, { label: "15m", sec: 900 },
];

export interface Broker {
  id: string;
  name: string;
  note: string;
  ready: boolean;
  defaultAsset: string;
  auth: "ssid" | "login" | "none";
}

// ready=false brokers are listed in the dropdown but greyed out until their provider exists on the bridge.
export const BROKERS: Broker[] = [
  { id: "deriv", name: "Deriv", note: "Connected with API Key / Token", ready: true, defaultAsset: "R_100", auth: "login" },
  { id: "quotex", name: "Quotex", note: "Email / Token login through the bridge", ready: true, defaultAsset: "EURUSD_otc", auth: "login" },
  { id: "iqoption", name: "IQ Option", note: "Email login through the bridge (read-only)", ready: true, defaultAsset: "EURUSD_otc", auth: "login" },
  { id: "pocket", name: "Pocket Option", note: "Connected through SSID", ready: true, defaultAsset: "EURUSD_otc", auth: "ssid" },
];
