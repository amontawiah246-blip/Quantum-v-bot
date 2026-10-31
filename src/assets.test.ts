import test from 'node:test';
import assert from 'node:assert/strict';
import { prettyName, groupOf, grouped, TIMEFRAMES, BROKERS } from './assets';

test('prettyName formats currency pairs correctly', () => {
  assert.equal(prettyName({ symbol: 'EURUSD_otc' }), 'EUR/USD OTC');
  assert.equal(prettyName({ symbol: 'GBPJPY_otc' }), 'GBP/JPY OTC');
  assert.equal(prettyName({ symbol: 'EURUSD' }), 'EUR/USD');
});

test('prettyName formats crypto pairs correctly', () => {
  assert.equal(prettyName({ symbol: 'BTCUSD_otc' }), 'BTC/USD OTC');
  assert.equal(prettyName({ symbol: 'ETHUSD_otc' }), 'ETH/USD OTC');
});

test('prettyName uses name if provided and not a 6-letter currency', () => {
  assert.equal(prettyName({ symbol: '#AAPL_otc', name: 'Apple' }), 'Apple OTC');
});

test('groupOf categorizes assets into OTC groups', () => {
  assert.equal(groupOf({ symbol: 'EURUSD_otc' }), 'Currencies OTC');
  assert.equal(groupOf({ symbol: 'BTCUSD_otc' }), 'Crypto OTC');
  assert.equal(groupOf({ symbol: 'XAUUSD_otc' }), 'Commodities OTC');
  assert.equal(groupOf({ symbol: '#AAPL_otc' }), 'Stocks OTC');
});

test('grouped orders and sorts by payout descending', () => {
  const assets = [
    { symbol: 'GBPUSD_otc', payout: 80, active: true },
    { symbol: 'EURUSD_otc', payout: 92, active: true },
    { symbol: 'USDJPY_otc', payout: 85, active: true },
  ];
  const result = grouped(assets);
  assert.equal(result.length, 1);
  assert.equal(result[0].group, 'Currencies OTC');
  assert.equal(result[0].items[0].symbol, 'EURUSD_otc');
  assert.equal(result[0].items[1].symbol, 'USDJPY_otc');
  assert.equal(result[0].items[2].symbol, 'GBPUSD_otc');
});

test('timeframes contain 5s, 15s, 30s, 1m, 5m, 15m', () => {
  const labels = TIMEFRAMES.map((t) => t.label);
  assert.deepEqual(labels, ['5s', '15s', '30s', '1m', '5m', '15m']);
});

test('brokers has Pocket Option ready and Broker 2 waiting', () => {
  const pocket = BROKERS.find((b) => b.id === 'pocket');
  const broker2 = BROKERS.find((b) => b.id === 'broker2');
  assert.equal(pocket?.ready, true);
  assert.equal(broker2?.ready, false);
});
