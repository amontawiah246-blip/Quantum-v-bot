import asyncio
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'

async def test():
    print("Testing with wait_for_assets...")
    async with PocketOptionAsync(ssid=SSID) as client:
        print("Connected? is_connected:", await client.is_connected() if asyncio.iscoroutinefunction(client.is_connected) else client.is_connected)
        print("SSID valid:", await client.is_ssid_valid() if asyncio.iscoroutinefunction(client.is_ssid_valid) else client.is_ssid_valid)
        
        print("Waiting for assets...")
        if asyncio.iscoroutinefunction(client.wait_for_assets):
            assets = await client.wait_for_assets()
        else:
            assets = client.wait_for_assets()
        print("Assets loaded! Total:", len(assets) if hasattr(assets, '__len__') else assets)
        
        balance = await client.balance() if asyncio.iscoroutinefunction(client.balance) else client.balance
        print("Balance:", balance)

        # Try active assets
        active = await client.active_assets() if asyncio.iscoroutinefunction(client.active_assets) else client.active_assets
        print("Active assets sample:", str(active)[:200])

        # Get candles
        try:
            print("Getting live candles for #AAPL_otc or EURUSD_otc...")
            candles = await client.get_candles_live("EURUSD_otc", 60, 10)
            print("get_candles_live count:", len(candles))
            if candles:
                print("Last candle:", candles[-1])
        except Exception as e:
            print("get_candles_live error:", type(e), e)

        print("Testing subscribe_symbol...")
        stream = await client.subscribe_symbol("EURUSD_otc")
        n = 0
        async for tick in stream:
            n += 1
            print(f"Stream tick {n}:", tick)
            if n >= 5:
                break

if __name__ == "__main__":
    asyncio.run(test())
