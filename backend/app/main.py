from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, mistakes, reviews, settings as settings_api, vocab
from app.config import config_diagnostics, get_settings
from app.kg.neo4j_client import Neo4jClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init storage; do not block startup if a DB is unreachable (eases local debug).
    print(f"[startup] config {config_diagnostics()}", flush=True)
    try:
        Neo4jClient.instance().init_constraints()
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] Neo4j init skipped: {exc}")
    try:
        from app.db.postgres import Postgres

        Postgres.instance().init_tables()
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] Postgres init skipped: {exc}")
    yield
    try:
        Neo4jClient.instance().close()
    except Exception:  # noqa: BLE001
        pass


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Trellis · 英语学习 Agent", version="0.0.1", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(chat.router, prefix="/api")
    app.include_router(reviews.router, prefix="/api")
    app.include_router(vocab.router, prefix="/api")
    app.include_router(mistakes.router, prefix="/api")
    app.include_router(settings_api.router, prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
