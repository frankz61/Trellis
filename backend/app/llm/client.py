from __future__ import annotations

import json
from collections.abc import AsyncIterator
from time import perf_counter
from typing import Any

import httpx

from app.config import get_settings


class LLMClient:
    """OpenAI-compatible model wrapper: complete / complete_json / astream."""

    _instance: "LLMClient | None" = None

    def __init__(self) -> None:
        s = get_settings()
        self._base_url = s.llm_base_url.rstrip("/")
        self._api_key = s.llm_api_key
        self._model = s.llm_model
        self._temperature = s.llm_temperature
        self._max_tokens = s.llm_max_tokens

    @classmethod
    def instance(cls) -> "LLMClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    def _resolve_config(
        self,
        *,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        return {
            "base_url": (base_url or self._base_url).rstrip("/"),
            "model": model or self._model,
            "temperature": self._temperature if temperature is None else temperature,
            "max_tokens": self._max_tokens if max_tokens is None else max_tokens,
        }

    def _payload(self, messages: list[dict], config: dict[str, Any], stream: bool = False) -> dict:
        return {
            "model": config["model"],
            "messages": messages,
            "temperature": config["temperature"],
            "max_tokens": config["max_tokens"],
            "stream": stream,
        }

    def _message_preview(self, messages: list[dict]) -> str:
        for message in reversed(messages):
            if message.get("role") == "user":
                content = str(message.get("content", ""))
                return " ".join(content.split())[:160]
        return ""

    def _log_request(self, purpose: str, config: dict[str, Any], messages: list[dict], stream: bool) -> None:
        roles = ",".join(str(message.get("role", "?")) for message in messages)
        preview = self._message_preview(messages)
        print(
            "[llm] request "
            f"purpose={purpose} model={config['model']} base_url={config['base_url']} "
            f"temperature={config['temperature']} max_tokens={config['max_tokens']} "
            f"stream={stream} messages={len(messages)} roles={roles} "
            f"last_user={preview!r}",
            flush=True,
        )

    def complete(
        self,
        messages: list[dict],
        *,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        purpose: str = "complete",
    ) -> str:
        config = self._resolve_config(
            base_url=base_url,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        payload = self._payload(messages, config)
        self._log_request(purpose, config, messages, stream=False)
        started = perf_counter()
        with httpx.Client(timeout=60) as client:
            try:
                resp = client.post(
                    f"{config['base_url']}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                elapsed_ms = int((perf_counter() - started) * 1000)
                if resp.is_error:
                    print(
                        f"[llm] response purpose={purpose} status={resp.status_code} "
                        f"elapsed_ms={elapsed_ms} body={resp.text[:500]!r}",
                        flush=True,
                    )
                resp.raise_for_status()
                data = resp.json()
                usage = data.get("usage", {})
                print(
                    f"[llm] response purpose={purpose} status={resp.status_code} "
                    f"elapsed_ms={elapsed_ms} usage={usage}",
                    flush=True,
                )
                return data["choices"][0]["message"]["content"]
            except Exception as exc:
                elapsed_ms = int((perf_counter() - started) * 1000)
                print(
                    f"[llm] error purpose={purpose} model={config['model']} "
                    f"elapsed_ms={elapsed_ms} error={exc}",
                    flush=True,
                )
                raise

    def complete_json(self, messages: list[dict], **kwargs: Any) -> dict:
        kwargs.setdefault("purpose", "complete_json")
        text = self.complete(messages, **kwargs).strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)

    async def astream(
        self,
        messages: list[dict],
        *,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        purpose: str = "stream",
    ) -> AsyncIterator[str]:
        config = self._resolve_config(
            base_url=base_url,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        payload = self._payload(messages, config, stream=True)
        self._log_request(purpose, config, messages, stream=True)
        started = perf_counter()
        chunks = 0
        chars = 0
        async with httpx.AsyncClient(timeout=60) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{config['base_url']}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        chunk = line[6:]
                        if chunk == "[DONE]":
                            break
                        delta = json.loads(chunk)["choices"][0]["delta"].get("content")
                        if delta:
                            chunks += 1
                            chars += len(delta)
                            yield delta
                    elapsed_ms = int((perf_counter() - started) * 1000)
                    print(
                        f"[llm] stream_done purpose={purpose} status={resp.status_code} "
                        f"elapsed_ms={elapsed_ms} chunks={chunks} chars={chars}",
                        flush=True,
                    )
            except Exception as exc:
                elapsed_ms = int((perf_counter() - started) * 1000)
                print(
                    f"[llm] error purpose={purpose} model={config['model']} "
                    f"elapsed_ms={elapsed_ms} chunks={chunks} chars={chars} error={exc}",
                    flush=True,
                )
                raise
