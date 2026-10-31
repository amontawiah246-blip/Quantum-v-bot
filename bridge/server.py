"""Pocket Option bridge: SSID -> BinaryOptionsToolsV2 -> HTTP/WebSocket for the dashboard.
Real data only: connects directly to Pocket Option API.
"""
import asyncio, json, os, time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

DEFAULT_SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'
SSID = os.environ.get("POCKET_SSID", "").strip() or DEFAULT_SSID
S = {"client": None, "ready": False, "error": "", "balance": None, "assets": []}
_lock = asyncio.Lock()


def field(d, *names):
    for n in names:
        if isinstance(d, dict) and d.get(n) is not None:
            return d[n]
        if not isinstance(d, dict) and getattr(d, n, None) is not None:
            return getattr(d, n)
    return None


async def connect() -> Optional[PocketOptionAsync]:
    if S["ready"] and S["client"]:
        return S["client"]
    async with _lock:
        if S["ready"] and S["client"]:
            return S["client"]
        if not SSID:
            S["error"] = "POCKET_SSID is not set"
            return None
        try:
            c = PocketOptionAsync(ssid=SSID)
            await c.connect()
            await c.wait_for_assets()
            S["client"] = c
            S["assets"] = await c.active_assets()
            try:
                S["balance"] = float(await c.balance())
            except Exception:
                pass
            S["ready"], S["error"] = True, ""
            return c
        except Exception as e:
            S["error"] = str(e)
            return None


@asynccontextmanager
async def lifespan(_):
    asyncio.create_task(connect())
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/status")
async def status():
    return {
        "ready": S["ready"],
        "error": S["error"],
        "balance": S["balance"],
        "demo": '"isDemo":1' in SSID.replace(" ", ""),
        "assets": len(S["assets"])
    }


@app.get("/api/assets")
async def assets():
    if not S["ready"]:
        await connect()
    try:
        if S["client"]:
            S["assets"] = await S["client"].active_assets()
    except Exception:
        pass
    out = []
    for a in S["assets"]:
        sym = field(a, "symbol")
        if not sym:
            continue
        out.append({
            "symbol": sym,
            "name": field(a, "name"),
            "payout": field(a, "payout", "profit", "percent"),
            "active": bool(field(a, "is_active", "active", "is_open") if field(a, "is_active", "active", "is_open") is not None else True),
        })
    return out


@app.post("/api/set-ssid")
async def set_ssid(data: dict):
    global SSID
    new_ssid = data.get("ssid", "").strip()
    if new_ssid:
        SSID = new_ssid
        S["ready"] = False
        S["client"] = None
        S["error"] = ""
        asyncio.create_task(connect())
        return {"status": "ok", "msg": "SSID updated, reconnecting..."}
    return {"status": "error", "msg": "Empty SSID"}


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    asset = sock.query_params.get("asset", "EURUSD_otc")
    tf = int(sock.query_params.get("tf", "60"))

    async def send(m):
        try:
            await sock.send_text(json.dumps(m))
        except Exception:
            pass

    try:
        client = await connect()
        if not client:
            await send({"type": "error", "msg": S["error"] or "bridge not ready"})
            return

        cur = None

        # 1. Fetch real historical candles directly from Pocket Option
        try:
            raw_hist = await asyncio.wait_for(client.client.history(asset, tf), 6)
            data = json.loads(raw_hist) if raw_hist else []
            by_time = {}
            for x in data:
                t = int(float(field(x, "timestamp", "time") or 0))
                if t > 1e11:
                    t //= 1000
                by_time[t] = {
                    "time": t,
                    "open": float(x["open"]),
                    "high": float(x["high"]),
                    "low": float(x["low"]),
                    "close": float(x["close"]),
                }
            candles = [by_time[t] for t in sorted(by_time.keys())]
            if candles:
                await send({"type": "history", "candles": candles})
                cur = dict(candles[-1])
        except Exception as e:
            await send({"type": "info", "msg": f"history info: {e}"})

        # 2. Subscribe to real-time live ticks
        stream = await client.subscribe_symbol(asset)
        async for item in stream:
            sym = field(item, "symbol", "asset")
            if sym and sym != asset:
                continue

            raw = field(item, "price", "close", "rate")
            if raw is None:
                continue
            try:
                price = float(raw)
            except (ValueError, TypeError):
                continue

            raw_t = field(item, "timestamp", "time")
            try:
                ts = int(float(raw_t)) if raw_t is not None else int(time.time())
                if ts > 1e11:
                    ts //= 1000
            except Exception:
                ts = int(time.time())

            b = int(ts // tf * tf)
            if cur and cur["time"] == b:
                cur["high"] = max(cur["high"], price)
                cur["low"] = min(cur["low"], price)
                cur["close"] = price
            elif not cur or b > cur["time"]:
                cur = {"time": b, "open": price, "high": price, "low": price, "close": price}
            else:
                if abs(ts - cur["time"]) <= tf:
                    cur["high"] = max(cur["high"], price)
                    cur["low"] = min(cur["low"], price)
                    cur["close"] = price
                else:
                    continue

            await send({"type": "tick", "price": price, "ts": ts, "candle": cur})
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        try:
            await send({"type": "error", "msg": str(e)})
        except Exception:
            pass
