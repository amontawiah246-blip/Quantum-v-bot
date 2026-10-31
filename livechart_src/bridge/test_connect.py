import asyncio
import os
import sys
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'

async def test():
    print("Testing PocketOption connection with SSID...")
    try:
        client = PocketOptionAsync(ssid=SSID)
        print("Initialized client:", client)
        await asyncio.sleep(2)
        print("Fetching candles for EURUSD_otc...")
        try:
            candles = await client.get_candles("EURUSD_otc", 60, 60 * 10)
            print(f"Candles received: count={len(candles) if candles else 0}")
            if candles:
                print("First candle sample:", candles[0])
        except Exception as e:
            print("get_candles error:", type(e), e)

        print("Testing subscribe_symbol...")
        stream = await client.subscribe_symbol("EURUSD_otc")
        print("Subscribed! Listening for 3 ticks...")
        count = 0
        async for item in stream:
            count += 1
            print(f"Tick #{count}:", item)
            if count >= 3:
                break
        print("Success! Test completed.")
    except Exception as e:
        print("Connection exception:", type(e), e)

if __name__ == "__main__":
    asyncio.run(test())
