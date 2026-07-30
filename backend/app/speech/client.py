from __future__ import annotations

from time import perf_counter

import httpx

from app.config import get_settings


class SpeechTranscriptionError(RuntimeError):
    """Raised when the configured speech-to-text provider rejects a request."""


class SpeechSynthesisError(RuntimeError):
    """Raised when the configured text-to-speech provider rejects a request."""


class SpeechClient:
    """Small OpenAI-compatible speech client."""

    _instance: "SpeechClient | None" = None

    def __init__(self) -> None:
        settings = get_settings()
        self._stt_base_url = (
            settings.stt_base_url or settings.llm_base_url
        ).rstrip("/")
        self._stt_api_key = settings.stt_api_key or settings.llm_api_key
        self._stt_model = settings.stt_model
        self._stt_timeout = settings.stt_timeout_seconds

        self._tts_base_url = (
            settings.tts_base_url
            or settings.stt_base_url
            or settings.llm_base_url
        ).rstrip("/")
        self._tts_api_key = (
            settings.tts_api_key
            or settings.stt_api_key
            or settings.llm_api_key
        )
        self._tts_model = settings.tts_model
        self._tts_voice = settings.tts_voice
        self._tts_response_format = settings.tts_response_format
        self._tts_timeout = settings.tts_timeout_seconds

    @classmethod
    def instance(cls) -> "SpeechClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def transcribe(
        self,
        *,
        content: bytes,
        filename: str,
        content_type: str,
        language: str = "en",
    ) -> dict:
        started = perf_counter()
        async with httpx.AsyncClient(timeout=self._stt_timeout) as client:
            try:
                response = await client.post(
                    f"{self._stt_base_url}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {self._stt_api_key}"},
                    data={
                        "model": self._stt_model,
                        "language": language,
                        "response_format": "json",
                    },
                    files={"file": (filename, content, content_type)},
                )
                elapsed_ms = int((perf_counter() - started) * 1000)
                if response.is_error:
                    print(
                        "[speech] transcription_failed "
                        f"model={self._stt_model} status={response.status_code} "
                        f"elapsed_ms={elapsed_ms}",
                        flush=True,
                    )
                    raise SpeechTranscriptionError(
                        f"Speech provider returned {response.status_code}"
                    )

                payload = response.json()
                text = str(payload.get("text", "")).strip()
                print(
                    "[speech] transcription_done "
                    f"model={self._stt_model} status={response.status_code} "
                    f"elapsed_ms={elapsed_ms} bytes={len(content)} chars={len(text)}",
                    flush=True,
                )
                return {
                    "text": text,
                    "language": language,
                    "model": self._stt_model,
                }
            except SpeechTranscriptionError:
                raise
            except Exception as exc:
                elapsed_ms = int((perf_counter() - started) * 1000)
                print(
                    "[speech] transcription_error "
                    f"model={self._stt_model} elapsed_ms={elapsed_ms} "
                    f"error={type(exc).__name__}",
                    flush=True,
                )
                raise SpeechTranscriptionError(
                    "Speech provider is unavailable"
                ) from exc

    async def synthesize(self, *, text: str) -> tuple[bytes, str]:
        """Generate audio without retaining either the text or response."""
        started = perf_counter()
        async with httpx.AsyncClient(timeout=self._tts_timeout) as client:
            try:
                response = await client.post(
                    f"{self._tts_base_url}/audio/speech",
                    headers={"Authorization": f"Bearer {self._tts_api_key}"},
                    json={
                        "model": self._tts_model,
                        "input": text,
                        "voice": self._tts_voice,
                        "response_format": self._tts_response_format,
                    },
                )
                elapsed_ms = int((perf_counter() - started) * 1000)
                if response.is_error:
                    print(
                        "[speech] synthesis_failed "
                        f"model={self._tts_model} status={response.status_code} "
                        f"elapsed_ms={elapsed_ms}",
                        flush=True,
                    )
                    raise SpeechSynthesisError(
                        f"Speech provider returned {response.status_code}"
                    )

                content_type = response.headers.get(
                    "content-type",
                    "audio/mpeg",
                ).split(";", 1)[0]
                if not response.content or "json" in content_type:
                    raise SpeechSynthesisError(
                        "Speech provider returned an invalid audio response"
                    )

                print(
                    "[speech] synthesis_done "
                    f"model={self._tts_model} status={response.status_code} "
                    f"elapsed_ms={elapsed_ms} chars={len(text)} "
                    f"bytes={len(response.content)}",
                    flush=True,
                )
                return response.content, content_type
            except SpeechSynthesisError:
                raise
            except Exception as exc:
                elapsed_ms = int((perf_counter() - started) * 1000)
                print(
                    "[speech] synthesis_error "
                    f"model={self._tts_model} elapsed_ms={elapsed_ms} "
                    f"error={type(exc).__name__}",
                    flush=True,
                )
                raise SpeechSynthesisError(
                    "Speech provider is unavailable"
                ) from exc
