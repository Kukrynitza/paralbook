import asyncio
import sys

import uvicorn

from app.config import SERVICE_HOST, SERVICE_PORT

if __name__ == "__main__":
    config = uvicorn.Config("app.main:app", host=SERVICE_HOST, port=SERVICE_PORT, log_level="info")
    server = uvicorn.Server(config)
    if sys.platform == "win32" and sys.version_info >= (3, 12):
        asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)
    elif sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(server.serve())
    else:
        asyncio.run(server.serve())
