from functools import lru_cache
import os
from pathlib import Path

from dotenv import dotenv_values
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root: backend/app/config.py -> parents[2]
_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Load config from the repo-root .env / .env.local (works regardless of cwd)."""

    model_config = SettingsConfigDict(
        env_file=(_ROOT / ".env", _ROOT / ".env.local"),
        extra="ignore",
    )

    # Neo4j (external service)
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neo4j"

    # PostgreSQL (sessions / settings / checkpointer)
    database_url: str = "postgresql://postgres:postgres@localhost:5432/trellis"

    # LLM (OpenAI-compatible)
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str = ""
    llm_model: str = "deepseek-chat"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 1024

    # App
    cors_origins: list[str] = ["http://localhost:5173"]
    # Dev server port (BACKEND_PORT in .env.local, set per session by scripts/alloc-ports.ps1)
    backend_port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()


def config_diagnostics() -> dict:
    """Non-secret config diagnostics for startup logs."""
    dotenv_config = {}
    env_files = (_ROOT / ".env", _ROOT / ".env.local")
    for env_file in env_files:
        if env_file.exists():
            dotenv_config.update(dotenv_values(env_file))

    settings = get_settings()
    return {
        "env_files": [str(path) for path in env_files],
        "llm_model": settings.llm_model,
        "dotenv_llm_model": dotenv_config.get("LLM_MODEL"),
        "process_env_llm_model": os.getenv("LLM_MODEL"),
        "backend_port": settings.backend_port,
    }
