import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBucket,
  updateCandleWithTick,
  calculateCandleCountdown,
  parseTickMessage,
} from './chart_logic';

test('calculateBucket rounds down to timeframe boundary', () => {
  assert.equal(calculateBucket(120, 60), 120);
  assert.equal(calculateBucket(125, 60), 120);
  assert.equal(calculateBucket(179, 60), 120);
  assert.equal(calculateBucket(180, 60), 180);
});

test('updateCandleWithTick creates new candle if bucket changes', () => {
  const candle = updateCandleWithTick(null, 125, 1.0500, 60);
  assert.deepEqual(candle, {
    time: 120,
    open: 1.0500,
    high: 1.0500,
    low: 1.0500,
    close: 1.0500,
  });
});

test('updateCandleWithTick updates high, low, close for current forming candle', () => {
  let candle = updateCandleWithTick(null, 120, 1.0500, 60);
  candle = updateCandleWithTick(candle, 130, 1.0520, 60);
  candle = updateCandleWithTick(candle, 140, 1.0480, 60);
  candle = updateCandleWithTick(candle, 150, 1.0510, 60);

  assert.equal(candle.open, 1.0500);
  assert.equal(candle.high, 1.0520);
  assert.equal(candle.low, 1.0480);
  assert.equal(candle.close, 1.0510);
});

test('calculateCandleCountdown returns correct seconds until close', () => {
  assert.equal(calculateCandleCountdown(120, 60), 60);
  assert.equal(calculateCandleCountdown(125, 60), 55);
  assert.equal(calculateCandleCountdown(179, 60), 1);
});

test('parseTickMessage handles Pocket Option string prices and timestamps', () => {
  const raw = {
    symbol: 'EURUSD_otc',
    timestamp: 1793482088,
    open: '1.0699',
    high: '1.0699',
    low: '1.0699',
    close: '1.06986',
  };
  const parsed = parseTickMessage(raw);
  assert.ok(parsed);
  assert.equal(parsed.timestamp, 1793482088);
  assert.equal(parsed.price, 1.06986);
});
