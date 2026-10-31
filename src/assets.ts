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
  const base = a.symbol.replace(/^#/, "").replace(/_otc$/i, "");
  const otc = /_otc$/i.test(a.symbol) ? " OTC" : "";
  if (/^[A-Z]{6}$/.test(base) && CCY.includes(base.slice(0, 3)) && CCY.includes(base.slice(3)))
    return `${base.slice(0, 3)}/${base.slice(3)}${otc}`;
  if (/^[A-Z]{3,5}USD$/.test(base) && CRYPTO.includes(base.slice(0, -3)))
    return `${base.slice(0, -3)}/USD${otc}`;
  return (a.name || base) + otc;
}

export function groupOf(a: Asset): string {
  const otc = /_otc$/i.test(a.symbol) ? " OTC" : "";
  const base = a.symbol.replace(/^#/, "").replace(/_otc$/i, "").toUpperCase();
  if (a.symbol.startsWith("#")) return "Stocks" + otc;
  if (CRYPTO.some((c) => base.startsWith(c))) return "Crypto" + otc;
  if (METALS_ENERGY.some((c) => base.startsWith(c))) return "Commodities" + otc;
  if (/^[A-Z]{6}$/.test(base) && CCY.includes(base.slice(0, 3))) return "Currencies" + otc;
  return "Indices & other" + otc;
}

const ORDER = [
  "Currencies OTC", "Crypto OTC", "Commodities OTC", "Stocks OTC", "Indices & other OTC",
  "Currencies", "Crypto", "Commodities", "Stocks", "Indices & other"
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

export const BROKERS = [
  { id: "pocket", name: "Pocket Option", note: "Connected through SSID", ready: true },
  { id: "broker2", name: "Broker 2", note: "Third-party API, not connected yet", ready: false },
];
