"""Pocket Option bridge: SSID -> BinaryOptionsToolsV2 -> HTTP/WebSocket for the dashboard. Real data only.

Why this does not use get_candles_live(): on the current Pocket Option servers the history endpoints use the
BROKER's clock (UTC+2 at the time of testing) while live ticks are normalised to UTC by the library. Asking
history for "now" in UTC therefore returns data from two hours ago. We measure the broker clock offset, ask for
history in broker time, convert the labels back to UTC, fill the last minutes from 5-second candles, and verify
the result against the live price before drawing anything.
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
        SSID = open(SESSION_FILE).read().strip()
    except Exception:
        pass
S = {"client": None, "ready": False, "error": "", "balance": None, "assets": []}
_lock = asyncio.Lock()
feeds = {}
ROWS = 300
MAX_GAP_PCT = 0.2  # history vs live price tolerance, percent


def lib_version():
    try:
        from importlib.metadata import version
        for n in ("BinaryOptionsToolsV2", "binaryoptionstoolsv2"):
            try:
                return version(n)
            except Exception:
                pass
    except Exception:
        pass
    return "unknown"


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


def norm(c):
    return {"time": int(to_epoch(field(c, "timestamp", "time"))), "open": float(field(c, "open")),
            "high": float(field(c, "high")), "low": float(field(c, "low")), "close": float(field(c, "close"))}


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


# ---------- shared live feed: one Pocket Option subscription per asset ----------
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
            for q in list(self.queues):
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


# ---------- history in broker time ----------
async def measure_offset(client) -> int:
    """Broker clock minus UTC, rounded to a quarter hour. Needs at least one live tick to have arrived."""
    try:
        st = float(await client.get_server_time())
        off = int(round((st - time.time()) / 900.0)) * 900
        return off if abs(off) <= 14 * 3600 else 0
    except Exception:
        return 0


async def fetch(client, asset, period, window, off, end_utc=None):
    """Candles for the window ending at end_utc, asked for in broker time, labels converted back to UTC."""
    end = int(end_utc if end_utc is not None else time.time())
    raw = await asyncio.wait_for(client.client.get_candles_advanced(asset, period, int(window), end + off), 25)
    data = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
    out = {}
    for x in data or []:
        try:
            c = norm(x)
            c["time"] -= off
            out[c["time"]] = c
        except Exception:
            continue
    return [out[t] for t in sorted(out)]


def aggregate(fine, tf, since):
    by = {}
    for c in fine:
        b = c["time"] // tf * tf
        if b < since:
            continue
        a = by.get(b)
        if not a:
            by[b] = {"time": b, "open": c["open"], "high": c["high"], "low": c["low"], "close": c["close"]}
        else:
            a["high"], a["low"], a["close"] = max(a["high"], c["high"]), min(a["low"], c["low"]), c["close"]
    return [by[b] for b in sorted(by)]


async def build_history(client, asset, tf, off):
    """Official candles at tf, plus the most recent minutes rebuilt from 5-second candles (history lags)."""
    main = await fetch(client, asset, tf, tf * ROWS, off)
    merged = {c["time"]: c for c in main}
    S["dbg"] = {"official_count": len(main), "official_newest": main[-1]["time"] if main else None,
                "fine5s_count": 0, "fine5s_newest": None}
    if tf > 5:
        since = (main[-1]["time"] if main else int(time.time()) - tf * 3)
        window = int(time.time() - since) + 30
        if window <= 4 * 3600:
            try:
                fine = await fetch(client, asset, 5, window, off)
                S["dbg"].update(fine5s_count=len(fine), fine5s_newest=fine[-1]["time"] if fine else None, fine5s_window_s=window)
                for c in aggregate(fine, tf, since):
                    merged.setdefault(c["time"], c)  # official candle wins where both exist
            except Exception:
                pass
    return [merged[t] for t in sorted(merged)]


async def history_checked(client, asset, tf, live_price):
    """Build history; if it disagrees with the live price, try other clock offsets and keep the best."""
    off = await measure_offset(client)
    tried = {}
    for cand in [off] + [o for o in (7200, 0, 3600, -7200, 10800) if o != off]:
        try:
            cs = await build_history(client, asset, tf, cand)
        except Exception:
            continue
        if not cs:
            continue
        gap = abs(cs[-1]["close"] - live_price) / live_price * 100
        tried[cand] = (gap, cs)
        if gap <= MAX_GAP_PCT:
            return cand, gap, cs
    if tried:
        cand = min(tried, key=lambda k: tried[k][0])
        return cand, tried[cand][0], tried[cand][1]
    return off, None, []


def merge_cur(candles, cur):
    if not cur:
        return candles
    if not candles:
        return [dict(cur)]
    if candles[-1]["time"] == cur["time"]:
        h = candles[-1]
        cur["open"], cur["high"], cur["low"] = h["open"], max(h["high"], cur["high"]), min(h["low"], cur["low"])
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
    return {"ready": S["ready"], "error": S["error"], "balance": S["balance"], "lib": lib_version(),
            "demo": ('"isDemo":1' in SSID.replace(" ", "")) if SSID else True, "assets": len(S["assets"])}


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
        out.append({"symbol": sym, "name": field(a, "name"), "payout": field(a, "payout", "profit", "percent"),
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
        open(SESSION_FILE, "w").write(new)
    except Exception:
        pass
    S.update(ready=False, client=None, error="")
    for f in list(feeds.values()):
        if f.task:
            f.task.cancel()
    asyncio.create_task(connect())
    return {"status": "ok", "msg": "SSID updated, reconnecting..."}


@app.get("/api/diag")
async def diag(asset: str = "EURUSD_otc", tf: int = 60):
    """What the dashboard will draw: measured clock offset, verification against live price, newest candles."""
    client = await connect()
    if not client:
        return {"error": S["error"]}
    feed, q = attach(asset)
    try:
        first = await asyncio.wait_for(q.get(), 10)
        if first is None:
            return {"error": "live feed ended"}
        live = first[1]
        off, gap, cs = await history_checked(client, asset, tf, live)
        fmt = lambda c: {**c, "utc": datetime.fromtimestamp(c["time"], timezone.utc).strftime("%H:%M:%S")}
        return {"lib": lib_version(), "asset": asset, "tf": tf,
                "now_utc": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                "measured_broker_offset_s": await measure_offset(client), "used_offset_s": off,
                "live_price": live, "gap_to_live_pct": None if gap is None else round(gap, 4),
                "count": len(cs), "newest": [fmt(c) for c in cs[-6:]],
                "sources": {k: (datetime.fromtimestamp(v, timezone.utc).strftime("%H:%M:%S") if k.endswith("newest") and v else v)
                            for k, v in (S.get("dbg") or {}).items()},
                "missing_candles_before_now": [datetime.fromtimestamp(t, timezone.utc).strftime("%H:%M:%S")
                                               for t in range(int(cs[-1]["time"]) + tf, int(time.time() // tf * tf) + tf, tf)]
                                              if cs else None}
    except Exception as e:
        return {"error": str(e)}
    finally:
        detach(feed, q)


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
        feed, q = attach(asset)
        try:
            first = await asyncio.wait_for(q.get(), 12)  # a tick must exist before the broker clock can be measured
        except asyncio.TimeoutError:
            await send({"type": "error", "msg": "no live ticks for this pair (market closed?)"})
            return
        if first is None:
            await send({"type": "error", "msg": "live feed ended"})
            return

        off, gap, candles = await history_checked(client, asset, tf, first[1])
        st = {"cur": None, "synced": time.time(), "off": off}
        if candles and gap is not None and gap > MAX_GAP_PCT:
            await send({"type": "info", "msg": f"history differs from live price by {gap:.2f}% even after clock correction; history hidden"})
            candles = []
        cur_bucket = int(time.time() // tf * tf)
        if candles and candles[-1]["time"] == cur_bucket:
            st["cur"] = dict(candles[-1])
        if candles:
            await send({"type": "history", "candles": candles})
        await send({"type": "info", "msg": f"broker clock offset {off}s, {len(candles)} candles"})

        async def resync():
            try:
                if tf >= 30:
                    await asyncio.sleep(3)
                cs = await build_history(client, asset, tf, st["off"])
                if cs:
                    await send({"type": "history", "resync": True, "candles": merge_cur(cs, st["cur"])})
            except Exception:
                pass

        resync_task = None

        async def pump():
            nonlocal resync_task
            pending = [first]
            while True:
                if pending:
                    tick = pending.pop(0)
                else:
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
                    continue
                await send({"type": "tick", "price": price, "ts": ts, "candle": cur})
                due = rolled if tf >= 30 else time.time() - st["synced"] > 60
                if due and not (resync_task and not resync_task.done()):
                    st["synced"] = time.time()
                    resync_task = asyncio.create_task(resync())

        async def watch():
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
