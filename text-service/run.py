import asyncio
import sys

import uvicorn

from app.config import SERVICE_HOST, SERVICE_PORT

if __name__ == "__main__":
    config = uvicorn.Config("app.main:app", host=SERVICE_HOST, port=SERVICE_PORT, log_level="info")
    server = uvicorn.Server(config)
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(server.serve(), loop_factory=loop_factory)
