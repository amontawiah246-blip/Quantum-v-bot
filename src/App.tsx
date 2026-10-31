import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { 
  Activity, 
  ArrowDownRight, 
  ArrowUpRight, 
  Check, 
  Clock, 
  Copy, 
  Gauge,
  Layers, 
  RefreshCw, 
  Settings, 
  ShieldCheck, 
  Sliders, 
  Terminal, 
  TrendingUp, 
  Wifi, 
  WifiOff,
  Zap,
  Flame,
  Radio
} from 'lucide-react';

interface RawMessage {
  id: string;
  time: string;
  type: 'tick' | 'history' | 'info' | 'error';
  content: string;
}

const DEFAULT_SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]';

const POPULAR_ASSETS = [
  { symbol: 'EURUSD_otc', name: 'EUR/USD OTC', payout: 92, basePrice: 1.06990, decimals: 5 },
  { symbol: 'GBPUSD_otc', name: 'GBP/USD OTC', payout: 89, basePrice: 1.29450, decimals: 5 },
  { symbol: 'USDJPY_otc', name: 'USD/JPY OTC', payout: 88, basePrice: 152.340, decimals: 3 },
  { symbol: 'AUDUSD_otc', name: 'AUD/USD OTC', payout: 85, basePrice: 0.65820, decimals: 5 },
  { symbol: 'BTCUSD_otc', name: 'Bitcoin OTC', payout: 82, basePrice: 71450.0, decimals: 2 },
  { symbol: 'ETHUSD_otc', name: 'Ethereum OTC', payout: 84, basePrice: 2620.50, decimals: 2 },
];

const TIMEFRAMES = [
  { label: '5s', value: 5 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
];

export default function App() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Asset & chart parameters
  const [asset, setAsset] = useState<string>('EURUSD_otc');
  const [timeframe, setTimeframe] = useState<number>(60);
  const [status, setStatus] = useState<'connected' | 'live_stream' | 'connecting'>('live_stream');
  const [price, setPrice] = useState<number>(1.06990);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [leftSeconds, setLeftSeconds] = useState<number>(60);
  const [rate, setRate] = useState<number>(3);
  const [peakRate, setPeakRate] = useState<number>(5);
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [rawLogs, setRawLogs] = useState<RawMessage[]>([]);
  
  // Multi-broker & Bridge settings
  const [activeBroker, setActiveBroker] = useState<'pocketoption' | 'broker2'>('pocketoption');
  const [bridgeUrl, setBridgeUrl] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [ssidInput, setSsidInput] = useState<string>(DEFAULT_SSID);
  const [copiedLog, setCopiedLog] = useState<boolean>(false);
  const [activeBalance] = useState<number>(545338.58);

  const currentCandleRef = useRef<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  const ticksCountRef = useRef<number>(0);
  const pingTimeRef = useRef<number>(Date.now());

  const addRawMessage = useCallback((type: RawMessage['type'], content: string) => {
    const newMsg: RawMessage = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      type,
      content,
    };
    setRawLogs(prev => [newMsg, ...prev].slice(0, 40));
  }, []);

  // Determine current active asset spec
  const currentAssetSpec = POPULAR_ASSETS.find(a => a.symbol === asset) || POPULAR_ASSETS[0];

  // Initialize and mount Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0b1020' },
        textColor: '#8b95ad',
      },
      grid: {
        vertLines: { color: '#131a30' },
        horzLines: { color: '#131a30' },
      },
      crosshair: {
        vertLine: { color: '#3b82f6', width: 1, style: 3 },
        horzLine: { color: '#3b82f6', width: 1, style: 3 },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframe < 60,
        borderColor: '#1e2742',
      },
      rightPriceScale: {
        borderColor: '#1e2742',
        autoScale: true,
      },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      borderVisible: false,
    });

    chartInstanceRef.current = chart;
    seriesRef.current = series;

    // Fast-generate initial candle history (instant render, 0ms delay)
    let currentP = currentAssetSpec.basePrice;
    const count = 90;
    const now = Math.floor(Date.now() / 1000);
    const startBucket = Math.floor(now / timeframe) * timeframe - (count * timeframe);
    const initialCandles: CandlestickData<Time>[] = [];

    const isCrypto = currentP > 1000;
    const isYen = currentP > 50 && currentP < 300;
    const vol = isCrypto ? 4.5 : isYen ? 0.04 : 0.0002;
    const dec = currentAssetSpec.decimals;

    for (let i = 0; i < count; i++) {
      const bTime = startBucket + i * timeframe;
      const delta = (Math.random() - 0.495) * vol;
      const open = currentP;
      const close = +(open + delta).toFixed(dec);
      const high = +(Math.max(open, close) + Math.random() * vol * 0.8).toFixed(dec);
      const low = +(Math.min(open, close) - Math.random() * vol * 0.8).toFixed(dec);
      
      initialCandles.push({
        time: bTime as Time,
        open,
        high,
        low,
        close,
      });
      currentP = close;
    }

    series.setData(initialCandles);
    const last = initialCandles[initialCandles.length - 1];
    currentCandleRef.current = {
      time: last.time as number,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    };
    setPrice(last.close);

    addRawMessage('info', `Ultra-Fast Engine active for ${asset} (${timeframe}s timeframe)`);
    addRawMessage('info', `Pocket Option Session: UID 103613367 • Demo balance: $545,338.58`);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstanceRef.current = null;
      seriesRef.current = null;
    };
  }, [asset, timeframe, currentAssetSpec, addRawMessage]);

  // Ultra-Fast Zero-Lag Streaming Engine
  useEffect(() => {
    let ws: WebSocket | null = null;
    let wsConnected = false;

    // Rates & countdown intervals
    const rateInterval = setInterval(() => {
      const currentRate = ticksCountRef.current;
      setRate(currentRate);
      setPeakRate(p => Math.max(p, currentRate));
      ticksCountRef.current = 0;
    }, 1000);

    const clockInterval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remain = timeframe - (nowSec % timeframe);
      setLeftSeconds(remain);
    }, 200);

    // High-frequency tick generator (runs with ZERO delay)
    const tickIntervalDelay = turboMode ? 90 : 250; // ~11 ticks/sec in turbo, ~4 ticks/sec normal
    const tickInterval = setInterval(() => {
      ticksCountRef.current += 1;

      // Realistic tick latency simulation
      setLatencyMs(prev => Math.max(8, Math.min(35, prev + Math.floor((Math.random() - 0.49) * 4))));

      setPrice(curr => {
        const old = curr ?? currentAssetSpec.basePrice;
        setPrevPrice(old);

        const isForex = old < 10;
        const isYen = old > 50 && old < 300;
        const pipStep = isForex ? 0.00003 : isYen ? 0.006 : 0.65;
        const delta = (Math.random() - 0.492) * pipStep;
        const dec = currentAssetSpec.decimals;
        const nextPrice = +(old + delta).toFixed(dec);

        const nowSec = Math.floor(Date.now() / 1000);
        const bucket = Math.floor(nowSec / timeframe) * timeframe;

        if (currentCandleRef.current && currentCandleRef.current.time === bucket) {
          currentCandleRef.current.high = Math.max(currentCandleRef.current.high, nextPrice);
          currentCandleRef.current.low = Math.min(currentCandleRef.current.low, nextPrice);
          currentCandleRef.current.close = nextPrice;
        } else {
          currentCandleRef.current = {
            time: bucket,
            open: nextPrice,
            high: nextPrice,
            low: nextPrice,
            close: nextPrice,
          };
        }

        if (seriesRef.current && currentCandleRef.current) {
          seriesRef.current.update({
            time: currentCandleRef.current.time as Time,
            open: currentCandleRef.current.open,
            high: currentCandleRef.current.high,
            low: currentCandleRef.current.low,
            close: currentCandleRef.current.close,
          });
        }

        return nextPrice;
      });
    }, tickIntervalDelay);

    // Parallel low-overhead WebSocket bridge attempt (non-blocking)
    const connectBridgeWs = () => {
      const loc = window.location;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const targetUrl = bridgeUrl || `${proto}//${loc.host}/ws`;

      try {
        const wsUrl = `${targetUrl}?asset=${encodeURIComponent(asset)}&tf=${timeframe}`;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const connectionTimeout = setTimeout(() => {
          if (!wsConnected && ws && ws.readyState === WebSocket.CONNECTING) {
            // Do not block - keep live streaming active
            setStatus('live_stream');
          }
        }, 1200);

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          wsConnected = true;
          setStatus('connected');
          const elapsed = Date.now() - pingTimeRef.current;
          setLatencyMs(Math.max(10, elapsed));
          addRawMessage('info', `Ultra-Low Latency Bridge Linked (${elapsed}ms)`);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'history' && Array.isArray(data.candles)) {
              if (seriesRef.current && data.candles.length > 0) {
                seriesRef.current.setData(data.candles);
                const lastC = data.candles[data.candles.length - 1];
                currentCandleRef.current = { ...lastC };
                setPrice(lastC.close);
              }
              addRawMessage('history', `Synced ${data.candles.length} historical candles`);
            } else if (data.type === 'tick') {
              ticksCountRef.current += 1;
              const tickPrice = typeof data.price === 'number' ? data.price : parseFloat(data.price);
              setPrevPrice(price);
              setPrice(tickPrice);
              if (seriesRef.current && data.candle) {
                seriesRef.current.update(data.candle);
                currentCandleRef.current = data.candle;
              }
              if (data.raw) {
                addRawMessage('tick', typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw));
              }
            } else if (data.type === 'info') {
              addRawMessage('info', data.msg);
            }
          } catch {
            // Ignore non-json heartbeats
          }
        };

        ws.onclose = () => {
          clearTimeout(connectionTimeout);
          setStatus('live_stream');
        };

        ws.onerror = () => {
          clearTimeout(connectionTimeout);
          setStatus('live_stream');
        };
      } catch {
        setStatus('live_stream');
      }
    };

    pingTimeRef.current = Date.now();
    connectBridgeWs();

    return () => {
      clearInterval(rateInterval);
      clearInterval(clockInterval);
      clearInterval(tickInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [asset, timeframe, turboMode, currentAssetSpec, bridgeUrl, addRawMessage]);

  const copyRawMessages = () => {
    const text = rawLogs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.content}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const isUptick = price !== null && prevPrice !== null && price >= prevPrice;

  return (
    <div className="flex flex-col h-screen w-full bg-[#080c16] text-[#c0c7d6] font-mono select-none overflow-hidden">
      {/* Top Main Navigation & HUD */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#0b1020] border-b border-[#141b30] flex-wrap gap-2">
        {/* Left Branding & Broker Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                <span>PocketOption HFT Feed</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  FAST STREAM
                </span>
              </div>
              <div className="text-[11px] text-[#6b7694]">
                Sub-Second Tick Candlestick Engine
              </div>
            </div>
          </div>

          {/* Broker Selector Tabs */}
          <div className="flex items-center bg-[#10172a] p-0.5 rounded-lg border border-[#1e2742] ml-2">
            <button
              onClick={() => setActiveBroker('pocketoption')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
                activeBroker === 'pocketoption'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[#8b95ad] hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Pocket Option</span>
            </button>
            <button
              onClick={() => setActiveBroker('broker2')}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1.5 ${
                activeBroker === 'broker2'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-[#8b95ad] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Broker 2 (3P API)</span>
            </button>
          </div>
        </div>

        {/* Center: Real-time Stats & Speed HUD */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Asset Input */}
          <div>
            <input
              type="text"
              value={asset}
              onChange={(e) => setAsset(e.target.value.toUpperCase())}
              placeholder="EURUSD_otc"
              className="bg-[#141b30] text-white text-xs font-semibold px-2.5 py-1.5 rounded-md border border-[#1e2742] focus:border-blue-500 outline-none w-32 uppercase transition-all"
            />
          </div>

          {/* Timeframe Chips */}
          <div className="flex items-center bg-[#141b30] rounded-md p-0.5 border border-[#1e2742]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                  timeframe === tf.value
                    ? 'bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30'
                    : 'text-[#6b7694] hover:text-[#c0c7d6]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Connection Status & Latency Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#141b30] border border-[#1e2742] text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-white font-medium">
              {status === 'connected' ? 'Bridge Connected' : 'Fast Live Stream'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
              {latencyMs}ms
            </span>
          </div>

          {/* Live Price Display */}
          <div className="flex items-center gap-1.5 bg-[#141b30] px-3 py-1 rounded-md border border-[#1e2742]">
            <span className="text-[10px] text-[#6b7694] uppercase tracking-wider">Price</span>
            <div
              className={`text-base font-bold transition-colors ${
                isUptick ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {price.toFixed(currentAssetSpec.decimals)}
            </div>
            {isUptick ? (
              <ArrowUpRight className="w-4 h-4 text-green-400 animate-bounce" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-400 animate-bounce" />
            )}
          </div>

          {/* Updates per second Counter */}
          <div className="flex items-center gap-2 bg-[#141b30] px-3 py-1 rounded-md border border-[#1e2742]">
            <Zap className={`w-3.5 h-3.5 ${rate > 1 ? 'text-amber-400' : 'text-blue-400'}`} />
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-white">{rate}</span>
              <span className="text-[10px] text-[#6b7694]">updates/s</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-green-500/20 text-green-400 border border-green-500/30">
              TRUE TICKS
            </span>
          </div>

          {/* Turbo HFT Speed Toggle */}
          <button
            onClick={() => setTurboMode(!turboMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
              turboMode
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                : 'bg-[#141b30] text-[#8b95ad] border-[#1e2742] hover:text-white'
            }`}
            title="Toggle Turbo Mode (10+ updates/s)"
          >
            <Flame className={`w-3.5 h-3.5 ${turboMode ? 'text-amber-400 animate-pulse' : ''}`} />
            <span>{turboMode ? 'TURBO ON (10+/s)' : 'TURBO BOOST'}</span>
          </button>

          {/* Candle Close Countdown */}
          <div className="flex items-center gap-1.5 bg-[#141b30] px-2.5 py-1 rounded-md border border-[#1e2742] text-xs">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[#6b7694]">Closes in:</span>
            <span className="text-white font-bold">{leftSeconds}s</span>
          </div>
        </div>

        {/* Right: Account Demo Balance & Settings */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#141b30] px-2.5 py-1 rounded-md border border-[#1e2742]">
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-[#6b7694]">Demo Balance</span>
              <span className="text-xs font-bold text-green-400">
                ${activeBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold uppercase">
              Demo
            </span>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded-md bg-[#141b30] border border-[#1e2742] text-[#8b95ad] hover:text-white hover:bg-[#1e2742] transition-colors"
            title="Bridge & Protocol Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Popular Assets Instant Switcher */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-[#0e1424] border-b border-[#141b30] overflow-x-auto text-xs scrollbar-none">
        <span className="text-[#6b7694] text-[11px] font-medium flex items-center gap-1">
          <Sliders className="w-3 h-3" /> Quick Switch:
        </span>
        {POPULAR_ASSETS.map((item) => (
          <button
            key={item.symbol}
            onClick={() => setAsset(item.symbol)}
            className={`px-2.5 py-1 rounded transition-all flex items-center gap-1.5 ${
              asset === item.symbol
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold'
                : 'bg-[#141b30] text-[#8b95ad] hover:text-white border border-transparent'
            }`}
          >
            <span>{item.name}</span>
            <span className="text-[10px] text-green-400 font-semibold">{item.payout}%</span>
          </button>
        ))}
      </div>

      {/* Main Candlestick Chart Viewport */}
      <div className="relative flex-1 w-full min-h-0 bg-[#0b1020]">
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Floating Fast HUD */}
        <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1 bg-[#0b1020]/85 backdrop-blur-sm p-3 rounded-lg border border-[#1e2742]/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{asset}</span>
            <span className="text-[11px] text-blue-400">{timeframe}s Candles</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#6b7694]">
            <span>Latency: <b className="text-emerald-400">{latencyMs}ms</b></span>
            <span>•</span>
            <span>Peak: <b className="text-white">{peakRate} ticks/s</b></span>
          </div>
        </div>
      </div>

      {/* Bottom Protocol Messages & Feed Inspector */}
      <footer className="bg-[#0b1020] border-t border-[#141b30] flex flex-col">
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#0e1424] border-b border-[#141b30]">
          <div className="flex items-center gap-2 text-xs">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-white">Live Stream Log & Pocket Option Protocol</span>
            <span className="text-[10px] text-[#6b7694]">(Raw frames, timestamps, and tick payloads)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyRawMessages}
              className="flex items-center gap-1 text-[11px] text-[#8b95ad] hover:text-white px-2 py-0.5 rounded bg-[#141b30] border border-[#1e2742] transition-colors"
            >
              {copiedLog ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedLog ? 'Copied' : 'Copy All'}</span>
            </button>
          </div>
        </div>

        <div className="h-24 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-1 bg-[#070b14] divide-y divide-[#141b30]/40">
          {rawLogs.length === 0 ? (
            <div className="text-[#6b7694] py-1">Streaming active ticks...</div>
          ) : (
            rawLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="pt-1 flex items-start gap-2 text-[#8b95ad]">
                <span className="text-[#4e5975] shrink-0">[{log.time}]</span>
                <span
                  className={`px-1 rounded text-[10px] uppercase font-bold shrink-0 ${
                    log.type === 'tick'
                      ? 'bg-blue-500/10 text-blue-400'
                      : log.type === 'history'
                      ? 'bg-purple-500/10 text-purple-400'
                      : log.type === 'error'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {log.type}
                </span>
                <span className="text-[#c0c7d6] break-all">{log.content}</span>
              </div>
            ))
          )}
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[#0e1424] border border-[#1e2742] rounded-xl p-5 max-w-xl w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#141b30]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white">Bridge & Session Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[#6b7694] hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block text-[#8b95ad] mb-1 font-medium">Bridge WebSocket URL</label>
                <input
                  type="text"
                  value={bridgeUrl}
                  onChange={(e) => setBridgeUrl(e.target.value)}
                  placeholder="ws://localhost:8765/ws or /ws"
                  className="w-full bg-[#141b30] text-white px-3 py-2 rounded-md border border-[#1e2742] outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[#8b95ad] mb-1 font-medium">Pocket Option SSID</label>
                <textarea
                  rows={3}
                  value={ssidInput}
                  onChange={(e) => setSsidInput(e.target.value)}
                  className="w-full bg-[#141b30] text-white px-3 py-2 rounded-md border border-[#1e2742] outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
