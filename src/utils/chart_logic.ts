/**
 * Pure functions for candlestick chart math and tick parsing
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function calculateBucket(timestamp: number, timeframeSeconds: number): number {
  return Math.floor(timestamp / timeframeSeconds) * timeframeSeconds;
}

export function updateCandleWithTick(
  current: Candle | null,
  tickTime: number,
  price: number,
  timeframeSeconds: number
): Candle {
  const bucket = calculateBucket(tickTime, timeframeSeconds);

  if (current && current.time === bucket) {
    return {
      time: bucket,
      open: current.open,
      high: Math.max(current.high, price),
      low: Math.min(current.low, price),
      close: price,
    };
  }

  return {
    time: bucket,
    open: price,
    high: price,
    low: price,
    close: price,
  };
}

export function calculateCandleCountdown(nowSeconds: number, timeframeSeconds: number): number {
  return timeframeSeconds - (nowSeconds % timeframeSeconds);
}

export function parseTickMessage(raw: unknown): { timestamp: number; price: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const rawPrice = d.price ?? d.close ?? d.rate ?? d.open;
  if (rawPrice === undefined || rawPrice === null) return null;

  const price = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice));
  if (isNaN(price)) return null;

  const rawTime = d.time ?? d.timestamp ?? Math.floor(Date.now() / 1000);
  const timestamp = typeof rawTime === 'number' ? rawTime : parseFloat(String(rawTime));
  return {
    timestamp: isNaN(timestamp) ? Math.floor(Date.now() / 1000) : timestamp,
    price,
  };
}
