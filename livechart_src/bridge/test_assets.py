import asyncio
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'

async def test():
    client = PocketOptionAsync(ssid=SSID)
    await client.connect()
    await client.wait_for_assets()
    assets = await client.active_assets()
    print("Found active assets:", len(assets))
    symbols = [a.get("symbol") for a in assets if isinstance(a, dict) and a.get("is_active")]
    print("Sample active symbols:", symbols[:15])

    bal = await client.balance()
    print("Account balance:", bal)
    is_demo = await client.is_demo() if hasattr(client, 'is_demo') else None
    print("Is demo:", is_demo)
    await client.disconnect()

if __name__ == "__main__":
    asyncio.run(test())
