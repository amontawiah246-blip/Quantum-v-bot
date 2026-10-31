"""Pocket Option bridge: SSID -> BinaryOptionsToolsV2 -> HTTP/WebSocket for the dashboard. Real data only.

Stability changes vs the previous version:
- ONE Pocket Option subscription per asset, shared by every browser tab (fan-out), instead of one per socket.
- A socket that disconnects is detected and its subscription released (before, orphaned streams piled up forever).
- Closed candles are re-synced from Pocket Option's own history after each candle closes, so tick-built candles
  can't drift from what the Pocket Option app shows.
- No SSID is hardcoded in this file. Set POCKET_SSID (or paste it on the API screen).
"""
import asyncio, json, os, time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

SESSION_FILE = "/tmp/pocket_ssid.txt"
SSID = os.environ.get("POCKET_SSID", "").strip()
if not SSID and os.path.exists(SESSION_FILE):
    try:
        with open(SESSION_FILE, "r") as f:
            SSID = f.read().strip()
    except Exception:
        pass

S = {"client": None, "ready": False, "error": "", "balance": None, "assets": []}
_lock = asyncio.Lock()
feeds = {}  # asset -> Feed


def to_epoch(v) -> float:
    if v is None:
        return time.time()
    if isinstance(v, datetime):
        return v.timestamp()
    try:
        v = float(v)
        return v / 1000 if v > 1e11 else v
    except (TypeError, ValueError):
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()


def field(d, *names):
    for n in names:
        v = d.get(n) if isinstance(d, dict) else getattr(d, n, None)
        if v is not None:
            return v
    return None


async def connect() -> Optional[PocketOptionAsync]:
    if S["ready"] and S["client"]:
        return S["client"]
    async with _lock:
        if S["ready"] and S["client"]:
            return S["client"]
        if not SSID:
            S["error"] = "No SSID set. Add POCKET_SSID or paste it on the API screen."
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


# ---------- shared live feed (one Pocket Option subscription per asset) ----------
class Feed:
    def __init__(self, asset):
        self.asset, self.queues, self.task = asset, set(), None

    async def run(self):
        try:
            client = await connect()
            if not client:
                return
            stream = await client.subscribe_symbol(self.asset)
            async for item in stream:
                sym = field(item, "symbol", "asset")
                raw = field(item, "price", "close", "rate")
                if raw is None or (sym and sym != self.asset):
                    continue
                try:
                    tick = (to_epoch(field(item, "timestamp", "time")), float(raw))
                except Exception:
                    continue
                for q in list(self.queues):
                    if q.full():
                        q.get_nowait()
                    q.put_nowait(tick)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            S["error"] = str(e)
        finally:
            for q in list(self.queues):  # tell listeners the feed ended
                if q.full():
                    q.get_nowait()
                q.put_nowait(None)
            if feeds.get(self.asset) is self:
                feeds.pop(self.asset, None)


def attach(asset):
    feed = feeds.get(asset)
    if not feed:
        feed = feeds[asset] = Feed(asset)
        feed.task = asyncio.create_task(feed.run())
    q = asyncio.Queue(maxsize=2000)
    feed.queues.add(q)
    return feed, q


def detach(feed, q):
    feed.queues.discard(q)
    if not feed.queues and feeds.get(feed.asset) is feed:
        feeds.pop(feed.asset, None)
        if feed.task:
            feed.task.cancel()


# ---------- history ----------
def norm(c):
    return {"time": int(to_epoch(field(c, "timestamp", "time"))), "open": float(field(c, "open")),
            "high": float(field(c, "high")), "low": float(field(c, "low")), "close": float(field(c, "close"))}


async def history(client, asset, tf):
    try:
        raw = await asyncio.wait_for(client.client.history(asset, tf), 8)
        data = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
    except Exception:
        data = await asyncio.wait_for(client.get_candles(asset, tf, tf * 300), 12)
    by = {}
    for x in data or []:
        try:
            c = norm(x)
            by[c["time"]] = c
        except Exception:
            continue
    return [by[t] for t in sorted(by)]


def merge_cur(candles, cur):
    """Put the tick-built forming candle on top of Pocket Option's official history."""
    if not cur:
        return candles
    if not candles:
        return [dict(cur)]
    if candles[-1]["time"] == cur["time"]:
        candles[-1] = dict(cur)
    elif cur["time"] > candles[-1]["time"]:
        candles.append(dict(cur))
    return candles


@asynccontextmanager
async def lifespan(_):
    asyncio.create_task(connect())
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/status")
async def status():
    return {"ready": S["ready"], "error": S["error"], "balance": S["balance"],
            "demo": '"isDemo":1' in SSID.replace(" ", "") if SSID else True, "assets": len(S["assets"])}


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
        act = field(a, "is_active", "active", "is_open")
        out.append({"symbol": sym, "name": field(a, "name"),
                    "payout": field(a, "payout", "profit", "percent"),
                    "active": True if act is None else bool(act)})
    return out


@app.post("/api/set-ssid")
async def set_ssid(data: dict):
    global SSID
    new = str(data.get("ssid", "")).strip()
    if not new:
        return {"status": "error", "msg": "Empty SSID"}
    SSID = new
    try:
        with open(SESSION_FILE, "w") as f:
            f.write(new)
    except Exception:
        pass
    S.update(ready=False, client=None, error="")
    for f in list(feeds.values()):  # old streams belong to the old session
        if f.task:
            f.task.cancel()
    asyncio.create_task(connect())
    return {"status": "ok", "msg": "SSID updated, reconnecting..."}


@app.get("/api/diag")
async def diag(asset: str = "EURUSD_otc", tf: int = 60):
    """Last candles two ways, with UTC clock times, to compare against the Pocket Option app."""
    client = await connect()
    if not client:
        return {"error": S["error"]}
    fmt = lambda c: {**c, "utc": datetime.fromtimestamp(c["time"], timezone.utc).strftime("%H:%M")}
    out = {"asset": asset, "tf": tf}
    try:
        h = await history(client, asset, tf)
        out["history_count"], out["history_last"] = len(h), [fmt(c) for c in h[-6:]]
    except Exception as e:
        out["history_error"] = str(e)
    try:
        g = await asyncio.wait_for(client.get_candles(asset, tf, tf * 10), 12)
        out["get_candles_last"] = [fmt(norm(c)) for c in list(g)[-6:]]
    except Exception as e:
        out["get_candles_error"] = str(e)
    return out


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    asset = sock.query_params.get("asset", "EURUSD_otc")
    tf = int(sock.query_params.get("tf", "60"))
    send_lock = asyncio.Lock()

    async def send(m):
        async with send_lock:
            await sock.send_text(json.dumps(m))

    feed = q = None
    tasks = []
    try:
        client = await connect()
        if not client:
            await send({"type": "error", "msg": S["error"] or "bridge not ready"})
            return
        feed, q = attach(asset)  # attach first so no tick is lost while history loads

        st = {"cur": None, "synced": time.time()}
        try:
            candles = await history(client, asset, tf)
            if candles:
                st["cur"] = dict(candles[-1])
                await send({"type": "history", "candles": candles})
        except Exception as e:
            await send({"type": "info", "msg": f"history unavailable: {e}"})

        async def resync():
            try:
                if tf >= 30:
                    await asyncio.sleep(2)  # let Pocket Option finalise the closed candle
                cs = await history(client, asset, tf)
                if cs:
                    await send({"type": "history", "resync": True, "candles": merge_cur(cs, st["cur"])})
            except Exception:
                pass

        resync_task = None

        async def pump():
            nonlocal resync_task
            while True:
                try:
                    tick = await asyncio.wait_for(q.get(), 20)
                except asyncio.TimeoutError:
                    await send({"type": "info", "msg": "no ticks for 20s (market closed or feed paused)"})
                    continue
                if tick is None:
                    await send({"type": "error", "msg": "live feed ended, reconnecting"})
                    return
                ts, price = tick
                b, cur, rolled = int(ts // tf * tf), st["cur"], False
                if cur and cur["time"] == b:
                    cur["high"], cur["low"], cur["close"] = max(cur["high"], price), min(cur["low"], price), price
                elif not cur or b > cur["time"]:
                    rolled = cur is not None
                    cur = st["cur"] = {"time": b, "open": price, "high": price, "low": price, "close": price}
                else:
                    continue  # stale tick from an older candle
                await send({"type": "tick", "price": price, "ts": ts, "candle": cur})
                due = rolled if tf >= 30 else time.time() - st["synced"] > 30
                if due and not (resync_task and not resync_task.done()):
                    st["synced"] = time.time()
                    resync_task = asyncio.create_task(resync())

        async def watch():  # notice when the browser goes away
            while True:
                m = await sock.receive()
                if m.get("type") == "websocket.disconnect":
                    return

        tasks = [asyncio.create_task(pump()), asyncio.create_task(watch())]
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        if resync_task:
            tasks.append(resync_task)
    except Exception as e:
        try:
            await send({"type": "error", "msg": str(e)})
        except Exception:
            pass
    finally:
        for t in tasks:
            t.cancel()
        if feed and q:
            detach(feed, q)
