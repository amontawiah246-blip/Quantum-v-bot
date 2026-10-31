"""Pocket Option live bridge: SSID -> BinaryOptionsToolsV2 -> WebSocket -> React.
Run:  POCKET_SSID='<your ssid>' uvicorn server:app --port 8000
"""
import asyncio, json, os, time
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
SSID = os.environ.get("POCKET_SSID", "")


def to_epoch(v):
    """Library may return epoch s/ms, ISO string or datetime."""
    if v is None:
        return time.time()
    if isinstance(v, datetime):
        return v.timestamp()
    if isinstance(v, str):
        try:
            v = float(v)
        except ValueError:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
    v = float(v)
    return v / 1000 if v > 1e11 else v


def parse(item):
    """Return (epoch, price) from whatever shape the stream yields."""
    if isinstance(item, dict):
        d = item
    else:
        d = {k: getattr(item, k) for k in dir(item) if not k.startswith("_")}
    price = d.get("price", d.get("close"))
    if price is None:
        return None
    return to_epoch(d.get("time", d.get("timestamp"))), float(price)


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    asset = sock.query_params.get("asset", "EURUSD_otc")
    tf = int(sock.query_params.get("tf", "60"))
    try:
        client = PocketOptionAsync(ssid=SSID)
        await asyncio.sleep(2)  # let the connection settle
        send = lambda m: sock.send_text(json.dumps(m))

        # History backfill (best effort)
        try:
            hist = await client.get_candles(asset, tf, tf * 120)
            await send({"type": "history", "candles": [
                {"time": int(to_epoch(c["time"])), "open": c["open"], "high": c["high"],
                 "low": c["low"], "close": c["close"]} for c in hist]})
        except Exception as e:
            await send({"type": "info", "msg": f"history unavailable: {e}"})

        cur = None
        n = 0
        stream = await client.subscribe_symbol(asset)
        async for item in stream:
            n += 1
            if n <= 3:
                await send({"type": "info", "msg": f"raw sample: {item!r}"[:300]})
            p = parse(item)
            if not p:
                continue
            ts, price = p
            bucket = int(ts // tf * tf)
            if cur and cur["time"] == bucket:
                cur["high"] = max(cur["high"], price)
                cur["low"] = min(cur["low"], price)
                cur["close"] = price
            else:
                cur = {"time": bucket, "open": price, "high": price, "low": price, "close": price}
            await send({"type": "tick", "ts": ts, "price": price, "candle": cur})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await sock.send_text(json.dumps({"type": "error", "msg": str(e)}))
        except Exception:
            pass
