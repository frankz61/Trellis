"""Run the FastAPI app on the fixed local debug port.

The default port is 57702. It comes from settings so an explicit BACKEND_PORT
environment override still works when needed.

Run (from backend/):
    python -m scripts.dev_server            # debug-friendly: no reload (breakpoints bind)
    python -m scripts.dev_server --reload   # hot reload (used by dev.ps1 terminal)
"""
from __future__ import annotations

import sys

import uvicorn

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    reload = "--reload" in sys.argv[1:]
    print(f"[dev_server] http://localhost:{settings.backend_port}  (reload={reload})")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.backend_port,
        reload=reload,
    )


if __name__ == "__main__":
    main()
