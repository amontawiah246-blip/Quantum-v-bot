import asyncio
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'

async def test():
    async with PocketOptionAsync(ssid=SSID) as client:
        await client.wait_for_assets()
        print("Testing get_candles...")
        try:
            candles = await client.get_candles("EURUSD_otc", 60, 60 * 30)
            print("get_candles count:", len(candles), "sample:", candles[-1] if candles else None)
        except Exception as e:
            print("get_candles error:", type(e), e)

        print("Testing client.candles...")
        try:
            c = client.candles
            print("candles attr:", type(c), c)
        except Exception as e:
            print("candles attr error:", e)

        print("Testing get_candles_live iteration...")
        try:
            live_gen = client.get_candles_live("EURUSD_otc", 60, 5)
            async for item in live_gen:
                print("live candle item:", item)
                break
        except Exception as e:
            print("get_candles_live error:", type(e), e)

if __name__ == "__main__":
    asyncio.run(test())
