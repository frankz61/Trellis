"""Shared user settings access and effective runtime config helpers."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.config import get_settings

_MEMORY_SETTINGS: dict[str, dict[str, Any]] = {}


def default_user_settings() -> dict[str, Any]:
    return {
        "base_url": None,
        "model_name": None,
        "temperature": None,
        "auto_save": True,
    }


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _normalize_settings(settings: Mapping[str, Any] | None) -> dict[str, Any]:
    normalized = default_user_settings()
    if settings:
        normalized.update({key: _blank_to_none(value) for key, value in settings.items()})
    return normalized


def get_user_settings(user_id: str) -> dict[str, Any]:
    try:
        from app.db.settings_store import get_settings_row

        row = get_settings_row(user_id)
        if row is not None:
            return _normalize_settings(row)
    except Exception as exc:  # noqa: BLE001
        print(f"[settings] PG read fallback: {exc}", flush=True)
    return dict(_MEMORY_SETTINGS.get(user_id, default_user_settings()))


def save_user_settings(user_id: str, settings: Mapping[str, Any]) -> dict[str, Any]:
    normalized = _normalize_settings(settings)
    try:
        from app.db.settings_store import upsert_settings

        upsert_settings(
            user_id,
            normalized["base_url"],
            normalized["model_name"],
            normalized["temperature"],
            normalized["auto_save"],
        )
        return normalized
    except Exception as exc:  # noqa: BLE001
        print(f"[settings] PG write fallback: {exc}", flush=True)
        _MEMORY_SETTINGS[user_id] = normalized
        return dict(normalized)


def clear_memory_user_settings(user_id: str) -> None:
    _MEMORY_SETTINGS.pop(user_id, None)


def get_effective_llm_config(user_id: str) -> dict[str, Any]:
    app_settings = get_settings()
    user_settings = get_user_settings(user_id)

    config: dict[str, Any] = {
        "base_url": app_settings.llm_base_url,
        "model": app_settings.llm_model,
        "temperature": app_settings.llm_temperature,
        "max_tokens": app_settings.llm_max_tokens,
        "source": "env",
    }

    overrides: list[str] = []
    if user_settings.get("base_url"):
        config["base_url"] = user_settings["base_url"]
        overrides.append("base_url")
    if user_settings.get("model_name"):
        config["model"] = user_settings["model_name"]
        overrides.append("model")
    if user_settings.get("temperature") is not None:
        config["temperature"] = user_settings["temperature"]
        overrides.append("temperature")

    if overrides:
        config["source"] = "user_settings:" + ",".join(overrides)
    return config
