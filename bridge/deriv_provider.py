"""Deriv (Binary.com) provider for QuantX bridge.
Connects to Deriv WebSocket API (wss://ws.derivws.com/websockets/v3?app_id=1089).
Provides live market data (ticks, candles, active symbols, balance) using Personal Access Token (PAT).
Includes complete Deriv options asset universe: Synthetic Indices, Forex Pairs, Commodities, Cryptos, and Stock Indices.
"""
import asyncio
import json
import os
import time
from typing import Dict, List, Optional

now = time.time

DEFAULT_PAT = "pat_12430e9f3555e6dd3a2ad5bb86555b0a530667adbd0b8efd1f97b3abdcdaf106"
APP_ID = "1089"
DERIV_WS_URLS = [
    f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}",
    f"wss://ws.binaryws.com/websockets/v3?app_id={APP_ID}"
]
SESSION_FILE = "/tmp/deriv_token.txt"


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# Full Deriv Options Currency Pairs & Synthetic Assets Catalog
ALL_DERIV_ASSETS = [
    # --- Synthetic Indices ---
    {"symbol": "R_100", "name": "Volatility 100 Index", "payout": 95, "active": True},
    {"symbol": "R_75", "name": "Volatility 75 Index", "payout": 95, "active": True},
    {"symbol": "R_50", "name": "Volatility 50 Index", "payout": 95, "active": True},
    {"symbol": "R_25", "name": "Volatility 25 Index", "payout": 95, "active": True},
    {"symbol": "R_10", "name": "Volatility 10 Index", "payout": 95, "active": True},
    {"symbol": "1HZ100V", "name": "Volatility 100 (1s) Index", "payout": 95, "active": True},
    {"symbol": "1HZ75V", "name": "Volatility 75 (1s) Index", "payout": 95, "active": True},
    {"symbol": "1HZ50V", "name": "Volatility 50 (1s) Index", "payout": 95, "active": True},
    {"symbol": "1HZ25V", "name": "Volatility 25 (1s) Index", "payout": 95, "active": True},
    {"symbol": "1HZ10V", "name": "Volatility 10 (1s) Index", "payout": 95, "active": True},
    {"symbol": "1HZ150V", "name": "Volatility 150 (1s) Index", "payout": 95, "active": True},
    {"symbol": "1HZ250V", "name": "Volatility 250 (1s) Index", "payout": 95, "active": True},
    {"symbol": "BOOM300", "name": "Boom 300 Index", "payout": 95, "active": True},
    {"symbol": "BOOM500", "name": "Boom 500 Index", "payout": 95, "active": True},
    {"symbol": "BOOM1000", "name": "Boom 1000 Index", "payout": 95, "active": True},
    {"symbol": "CRASH300", "name": "Crash 300 Index", "payout": 95, "active": True},
    {"symbol": "CRASH500", "name": "Crash 500 Index", "payout": 95, "active": True},
    {"symbol": "CRASH1000", "name": "Crash 1000 Index", "payout": 95, "active": True},
    {"symbol": "JD10", "name": "Jump 10 Index", "payout": 95, "active": True},
    {"symbol": "JD25", "name": "Jump 25 Index", "payout": 95, "active": True},
    {"symbol": "JD50", "name": "Jump 50 Index", "payout": 95, "active": True},
    {"symbol": "JD75", "name": "Jump 75 Index", "payout": 95, "active": True},
    {"symbol": "JD100", "name": "Jump 100 Index", "payout": 95, "active": True},
    {"symbol": "RDBEAR", "name": "Bear Market Index", "payout": 95, "active": True},
    {"symbol": "RDBULL", "name": "Bull Market Index", "payout": 95, "active": True},
    {"symbol": "STPRNG", "name": "Step Index", "payout": 95, "active": True},

    # --- Forex Currency Pairs (Majors, Minors, Exotics) ---
    {"symbol": "frxEURUSD", "name": "EUR/USD", "payout": 88, "active": True},
    {"symbol": "frxGBPUSD", "name": "GBP/USD", "payout": 88, "active": True},
    {"symbol": "frxUSDJPY", "name": "USD/JPY", "payout": 88, "active": True},
    {"symbol": "frxAUDUSD", "name": "AUD/USD", "payout": 88, "active": True},
    {"symbol": "frxUSDCAD", "name": "USD/CAD", "payout": 88, "active": True},
    {"symbol": "frxUSDCHF", "name": "USD/CHF", "payout": 88, "active": True},
    {"symbol": "frxNZDUSD", "name": "NZD/USD", "payout": 88, "active": True},

    {"symbol": "frxEURGBP", "name": "EUR/GBP", "payout": 85, "active": True},
    {"symbol": "frxEURJPY", "name": "EUR/JPY", "payout": 85, "active": True},
    {"symbol": "frxEURAUD", "name": "EUR/AUD", "payout": 85, "active": True},
    {"symbol": "frxEURCAD", "name": "EUR/CAD", "payout": 85, "active": True},
    {"symbol": "frxEURCHF", "name": "EUR/CHF", "payout": 85, "active": True},
    {"symbol": "frxEURNZD", "name": "EUR/NZD", "payout": 85, "active": True},

    {"symbol": "frxGBPJPY", "name": "GBP/JPY", "payout": 85, "active": True},
    {"symbol": "frxGBPAUD", "name": "GBP/AUD", "payout": 85, "active": True},
    {"symbol": "frxGBPCAD", "name": "GBP/CAD", "payout": 85, "active": True},
    {"symbol": "frxGBPCHF", "name": "GBP/CHF", "payout": 85, "active": True},
    {"symbol": "frxGBPNZD", "name": "GBP/NZD", "payout": 85, "active": True},

    {"symbol": "frxAUDJPY", "name": "AUD/JPY", "payout": 85, "active": True},
    {"symbol": "frxAUDCAD", "name": "AUD/CAD", "payout": 85, "active": True},
    {"symbol": "frxAUDCHF", "name": "AUD/CHF", "payout": 85, "active": True},
    {"symbol": "frxAUDNZD", "name": "AUD/NZD", "payout": 85, "active": True},

    {"symbol": "frxNZDJPY", "name": "NZD/JPY", "payout": 85, "active": True},
    {"symbol": "frxNZDCAD", "name": "NZD/CAD", "payout": 85, "active": True},
    {"symbol": "frxNZDCHF", "name": "NZD/CHF", "payout": 85, "active": True},

    {"symbol": "frxUSDMXN", "name": "USD/MXN", "payout": 82, "active": True},
    {"symbol": "frxUSDNOK", "name": "USD/NOK", "payout": 82, "active": True},
    {"symbol": "frxUSDPLN", "name": "USD/PLN", "payout": 82, "active": True},
    {"symbol": "frxUSDSEK", "name": "USD/SEK", "payout": 82, "active": True},
    {"symbol": "frxUSDZAR", "name": "USD/ZAR", "payout": 82, "active": True},

    # --- Commodities & Metals ---
    {"symbol": "frxXAUUSD", "name": "Gold / USD", "payout": 88, "active": True},
    {"symbol": "frxXAGUSD", "name": "Silver / USD", "payout": 85, "active": True},
    {"symbol": "frxXPDUSD", "name": "Palladium / USD", "payout": 80, "active": True},
    {"symbol": "frxXPTUSD", "name": "Platinum / USD", "payout": 80, "active": True},
    {"symbol": "frxBROUSD", "name": "Brent Crude Oil", "payout": 85, "active": True},
    {"symbol": "frxXTIUSD", "name": "US WTI Oil", "payout": 85, "active": True},

    # --- Cryptocurrencies ---
    {"symbol": "cryBTCUSD", "name": "BTC/USD (Bitcoin)", "payout": 85, "active": True},
    {"symbol": "cryETHUSD", "name": "ETH/USD (Ethereum)", "payout": 85, "active": True},
    {"symbol": "cryLTCUSD", "name": "LTC/USD (Litecoin)", "payout": 80, "active": True},
    {"symbol": "cryXRPUSD", "name": "XRP/USD (Ripple)", "payout": 80, "active": True},
    {"symbol": "crySOLUSD", "name": "SOL/USD (Solana)", "payout": 80, "active": True},
    {"symbol": "cryBCHUSD", "name": "BCH/USD (Bitcoin Cash)", "payout": 80, "active": True},

    # --- Stock Indices ---
    {"symbol": "OTC_SPC", "name": "US 500 Index", "payout": 80, "active": True},
    {"symbol": "OTC_NDX", "name": "US Tech 100 Index", "payout": 80, "active": True},
    {"symbol": "OTC_DJI", "name": "Wall Street 30 Index", "payout": 80, "active": True},
    {"symbol": "OTC_FCHI", "name": "France 40 Index", "payout": 80, "active": True},
    {"symbol": "OTC_GDAXI", "name": "Germany 40 Index", "payout": 80, "active": True},
    {"symbol": "OTC_UK100", "name": "UK 100 Index", "payout": 80, "active": True},
    {"symbol": "OTC_N225", "name": "Japan 225 Index", "payout": 80, "active": True}
]


class DerivProvider:
    name = "deriv"

    def __init__(self):
        token = os.environ.get("DERIV_TOKEN", os.environ.get("DERIV_API_KEY", "")).strip()
        if not token and os.path.exists(SESSION_FILE):
            try:
                token = open(SESSION_FILE).read().strip()
            except Exception:
                pass
        self.token = token or DEFAULT_PAT

        self.ready = True
        self.error = ""
        self.balance: Optional[float] = None
        self.currency: str = "USD"
        self.assets: List[dict] = ALL_DERIV_ASSETS
        
        self._ws = None
        self._lock = asyncio.Lock()
        self._subs: Dict[str, set] = {}  # symbol -> set of asyncio.Queue
        self._pending_reqs: Dict[int, asyncio.Future] = {}
        self._req_id = 0
        self._reader_task = None

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def set_credentials(self, email="", password="", ssid=""):
        token = ssid or email
        if token:
            self.token = token.strip()
            try:
                open(SESSION_FILE, "w").write(self.token)
            except Exception:
                pass
        self.error = ""
        self._drop()

    def _drop(self):
        self.ready = False
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            self._reader_task = None
        if self._ws:
            ws = self._ws
            self._ws = None
            try:
                asyncio.ensure_future(ws.close())
            except Exception:
                pass
        self._wake()

    def _wake(self):
        """Notify all tick listeners when connection is dropped."""
        for q_set in self._subs.values():
            for q in list(q_set):
                if q.full():
                    try:
                        q.get_nowait()
                    except Exception:
                        pass
                q.put_nowait(None)

    def _next_req_id(self) -> int:
        self._req_id += 1
        return self._req_id

    async def _send_req(self, payload: dict, timeout=15) -> dict:
        if not self._ws or getattr(self._ws, "closed", False):
            raise ConnectionError("Deriv WebSocket is not connected")
        
        req_id = self._next_req_id()
        payload["req_id"] = req_id
        fut = asyncio.get_running_loop().create_future()
        self._pending_reqs[req_id] = fut

        try:
            msg_str = json.dumps(payload)
            if hasattr(self._ws, "send_str"):
                await self._ws.send_str(msg_str)
            elif hasattr(self._ws, "send"):
                await self._ws.send(msg_str)
            else:
                raise ConnectionError("Invalid WebSocket instance")
            
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending_reqs.pop(req_id, None)

    async def _read_loop(self):
        try:
            while self._ws and not getattr(self._ws, "closed", False):
                if hasattr(self._ws, "recv"):
                    res = await self._ws.recv()
                    raw = res[0] if isinstance(res, tuple) else res
                elif hasattr(self._ws, "receive_str"):
                    raw = await self._ws.receive_str()
                else:
                    break

                if not raw:
                    continue

                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", errors="ignore")

                data = json.loads(raw)
                msg_type = data.get("msg_type")
                req_id = data.get("req_id")

                if req_id in self._pending_reqs:
                    fut = self._pending_reqs[req_id]
                    if not fut.done():
                        if "error" in data:
                            fut.set_exception(Exception(data["error"].get("message", "Deriv API error")))
                        else:
                            fut.set_result(data)

                if msg_type == "tick" and "tick" in data:
                    t = data["tick"]
                    sym = t.get("symbol")
                    price = _num(t.get("quote"))
                    raw_epoch = _num(t.get("epoch")) or now()
                    if sym and price is not None:
                        queues = self._subs.get(sym)
                        if queues:
                            for q in list(queues):
                                if q.full():
                                    try:
                                        q.get_nowait()
                                    except Exception:
                                        pass
                                q.put_nowait((raw_epoch, price))

        except asyncio.CancelledError:
            raise
        except Exception as e:
            pass
        finally:
            self._wake()

    async def connect(self):
        if self.ready and self._ws:
            return self

        async with self._lock:
            if self.ready and self._ws:
                return self

            if not self.configured:
                self.error = "Deriv API token / PAT not provided"
                self.ready = True
                return self

            try:
                import websockets
            except ImportError:
                self.ready = True
                return self

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Origin": "https://app.deriv.com",
                "Accept-Language": "en-US,en;q=0.9"
            }

            connected_ws = None
            for url in DERIV_WS_URLS:
                try:
                    if hasattr(websockets, "connect"):
                        try:
                            connected_ws = await asyncio.wait_for(
                                websockets.connect(url, additional_headers=headers),
                                timeout=5.0
                            )
                        except TypeError:
                            connected_ws = await asyncio.wait_for(
                                websockets.connect(url, extra_headers=headers),
                                timeout=5.0
                            )
                    if connected_ws:
                        break
                except Exception:
                    continue

            self.ready = True
            self.error = ""

            if not connected_ws:
                return self

            self._ws = connected_ws
            self._reader_task = asyncio.create_task(self._read_loop())

            # 1. Authorize with PAT
            try:
                auth_res = await self._send_req({"authorize": self.token}, timeout=10)
                auth_info = auth_res.get("authorize", {})
                self.balance = _num(auth_info.get("balance"))
                self.currency = auth_info.get("currency", "USD")
            except Exception:
                pass

            # 2. Dynamic Active symbols refresh
            try:
                sym_res = await self._send_req({"active_symbols": "brief", "product_type": "basic"}, timeout=10)
                raw_syms = sym_res.get("active_symbols", [])
                parsed = []
                for s in raw_syms:
                    sym = s.get("symbol")
                    name = s.get("display_name") or sym
                    is_suspended = bool(s.get("is_trading_suspended"))
                    if sym:
                        parsed.append({
                            "symbol": sym,
                            "name": name,
                            "payout": 95 if "index" in s.get("market", "") else 88,
                            "active": not is_suspended
                        })
                if parsed and len(parsed) > 10:
                    self.assets = parsed
            except Exception:
                pass

            return self

    async def list_assets(self) -> List[dict]:
        if not self.ready:
            await self.connect()
        return self.assets

    async def ticks(self, asset: str):
        """Yield real-time ticks for asset."""
        if not self.ready:
            await self.connect()
        if not self.ready or not self._ws:
            return

        q = asyncio.Queue(maxsize=1000)
        first_sub = asset not in self._subs
        self._subs.setdefault(asset, set()).add(q)

        try:
            if first_sub and self._ws:
                try:
                    await self._send_req({"ticks": asset}, timeout=10)
                except Exception:
                    pass

            last_ts = 0.0
            while self.ready:
                item = await q.get()
                if item is None:
                    break
                ts, price = item
                if price is None:
                    continue
                if abs(ts - now()) > 120:
                    ts = now()
                ts = max(ts, last_ts)
                last_ts = ts
                yield ts, price

        finally:
            subs = self._subs.get(asset)
            if subs:
                subs.discard(q)
                if not subs:
                    self._subs.pop(asset, None)
                    if self._ws:
                        try:
                            await self._send_req({"forget": asset}, timeout=5)
                        except Exception:
                            pass

    async def candles(self, asset: str, tf: int, window: int) -> List[dict]:
        """Fetch historical candles from Deriv."""
        if not self.ready:
            await self.connect()
        if not self.ready or not self._ws:
            return []

        try:
            count = max(1, min(1000, int(window // tf) + 1))
            res = await self._send_req({
                "ticks_history": asset,
                "adjust_start_time": 1,
                "count": count,
                "end": "latest",
                "granularity": int(tf),
                "style": "candles"
            }, timeout=10)

            raw_candles = res.get("candles", [])
            out = {}
            for c in raw_candles:
                t = _num(c.get("epoch"))
                o = _num(c.get("open"))
                h = _num(c.get("high"))
                l = _num(c.get("low"))
                cl = _num(c.get("close"))
                if t is None or o is None or cl is None:
                    continue
                t_int = int(t // tf * tf)
                out[t_int] = {
                    "time": t_int,
                    "open": o,
                    "high": h if h is not None else max(o, cl),
                    "low": l if l is not None else min(o, cl),
                    "close": cl
                }
            return [out[k] for k in sorted(out)]
        except Exception:
            return []
