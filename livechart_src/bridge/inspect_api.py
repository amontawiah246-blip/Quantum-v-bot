import asyncio
from BinaryOptionsToolsV2.pocketoption import PocketOptionAsync

SSID = '42["auth",{"session":"7l0u69vk978vec0elak4ab084a","isDemo":1,"uid":103613367,"platform":2,"isFastHistory":true,"isOptimized":true}]'

async def test():
    client = PocketOptionAsync(ssid=SSID)
    print("Methods and attributes:")
    for attr in dir(client):
        if not attr.startswith("__"):
            print(attr)

if __name__ == "__main__":
    asyncio.run(test())
