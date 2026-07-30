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

    # Speech-to-text (OpenAI-compatible; falls back to the LLM endpoint/key)
    stt_base_url: str = ""
    stt_api_key: str = ""
    stt_model: str = "groq/whisper-large-v3-turbo"
    stt_timeout_seconds: float = 60
    audio_max_mb: int = 10

    # Text-to-speech (OpenAI-compatible; falls back to the STT/LLM endpoint/key)
    tts_base_url: str = ""
    tts_api_key: str = ""
    tts_model: str = "deepgram/aura-asteria-en"
    tts_voice: str = "asteria"
    tts_response_format: str = "mp3"
    tts_timeout_seconds: float = 60
    tts_max_input_chars: int = 2000

    # App
    cors_origins: list[str] = [
        "http://localhost:57701",
        "http://127.0.0.1:57701",
    ]
    # Fixed local debug port; BACKEND_PORT may override it when explicitly needed.
    backend_port: int = 57702


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
        "stt_model": settings.stt_model,
        "tts_model": settings.tts_model,
        "backend_port": settings.backend_port,
    }
