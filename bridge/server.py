"""High-performance Pocket Option bridge: Warm singleton client, zero-delay streaming."""
import asyncio
import json
import os
import time
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

app = FastAPI(title="PocketOption Ultra-Fast Live Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SSID = os.environ.get(
    "POCKET_SSID",
    '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'
)

# Persistent warm client
_client_instance: Optional[PocketOptionAsync] = None
_client_lock = asyncio.Lock()
_is_ready = False
_account_data = {"balance": 545338.58, "is_demo": True, "connected": False}
_active_assets: List[dict] = []


async def init_client():
    global _client_instance, _is_ready, _account_data, _active_assets
    if _client_instance is not None and _is_ready:
        return _client_instance
    async with _client_lock:
        if _client_instance is not None and _is_ready:
            return _client_instance
        try:
            client = PocketOptionAsync(ssid=SSID)
            await client.connect()
            await client.wait_for_assets()
            _active_assets = await client.active_assets()
            try:
                _account_data["balance"] = float(await client.balance())
            except Exception:
                pass
            _account_data["connected"] = True
            _client_instance = client
            _is_ready = True
            return _client_instance
        except Exception as e:
            print(f"[Bridge Init Error] {e}")
            return None


def to_epoch(v) -> float:
    if v is None:
        return time.time()
    if isinstance(v, (int, float)):
        return float(v / 1000.0 if v > 1e11 else v)
    if isinstance(v, datetime):
        return v.timestamp()
    if isinstance(v, str):
        try:
            val = float(v)
            return float(val / 1000.0 if val > 1e11 else val)
        except ValueError:
            try:
                return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()
            except Exception:
                return time.time()
    return time.time()


def parse(item) -> Optional[tuple]:
    if isinstance(item, dict):
        d = item
    else:
        d = {k: getattr(item, k) for k in dir(item) if not k.startswith("_")}
    
    price_val = d.get("price") or d.get("close") or d.get("rate") or d.get("open")
    if price_val is None:
        return None
    try:
        price = float(price_val)
    except (ValueError, TypeError):
        return None

    raw_ts = d.get("time") or d.get("timestamp") or d.get("created_at")
    return to_epoch(raw_ts), price


@app.on_event("startup")
async def on_startup():
    # Warm up Pocket Option connection immediately on server boot in the background
    asyncio.create_task(init_client())


@app.get("/api/status")
async def get_status():
    return {
        "status": "ready" if _is_ready else "initializing",
        "account": _account_data,
        "assets_count": len(_active_assets)
    }


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    asset = sock.query_params.get("asset", "EURUSD_otc")
    tf = int(sock.query_params.get("tf", "60"))

    client = await init_client()
    if not client:
        await sock.send_text(json.dumps({"type": "info", "msg": "Client initializing, using fast live stream"}))

    async def send_msg(m: dict):
        try:
            await sock.send_text(json.dumps(m))
        except Exception:
            pass

    # Acknowledge connection immediately (0ms delay)
    await send_msg({
        "type": "info",
        "msg": f"Ultra-Fast Bridge Active: {asset} | Balance: ${_account_data['balance']:.2f}"
    })

    cur = None
    if client:
        # Launch history fetch in background task so live ticks are NOT blocked!
        async def fetch_history_bg():
            try:
                hist = await client.get_candles(asset, tf, tf * 90)
                seen = {}
                for c in hist:
                    t = int(to_epoch(c["time"]))
                    seen[t] = {
                        "time": t,
                        "open": float(c["open"]),
                        "high": float(c["high"]),
                        "low": float(c["low"]),
                        "close": float(c["close"])
                    }
                candles = sorted(seen.values(), key=lambda x: x["time"])
                await send_msg({"type": "history", "candles": candles})
            except Exception as e:
                await send_msg({"type": "info", "msg": f"History notice: {e}"})

        asyncio.create_task(fetch_history_bg())

        # Start streaming live ticks immediately
        try:
            stream = await client.subscribe_symbol(asset)
            n = 0
            async for item in stream:
                n += 1
                if n <= 3:
                    await send_msg({"type": "info", "msg": f"raw sample #{n}: {item!r}"[:300]})
                
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
                
                await send_msg({
                    "type": "tick",
                    "ts": ts,
                    "price": price,
                    "candle": cur,
                    "raw": item if n <= 5 else None
                })
        except WebSocketDisconnect:
            pass
        except Exception as e:
            await send_msg({"type": "error", "msg": str(e)})
    else:
        # High speed demo loop if bridge client waiting
        try:
            while True:
                await asyncio.sleep(0.25)
                # Heartbeat keepalive
                await send_msg({"type": "ping", "server_time": time.time()})
        except WebSocketDisconnect:
            pass
