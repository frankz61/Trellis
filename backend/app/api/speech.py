from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from app.config import get_settings
from app.speech import (
    SpeechClient,
    SpeechSynthesisError,
    SpeechTranscriptionError,
)

router = APIRouter(tags=["speech"])

_SUPPORTED_EXTENSIONS = {
    ".m4a",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpga",
    ".wav",
    ".webm",
}


class SpeechSynthesisRequest(BaseModel):
    text: str


@router.post("/audio/transcriptions")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("en"),
):
    """Transcribe a bounded audio upload without retaining the source file."""
    settings = get_settings()
    filename = Path(file.filename or "recording.webm").name
    extension = Path(filename).suffix.lower()
    if extension not in _SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="不支持这种音频格式，请上传 MP3、M4A、WAV 或 WebM 文件",
        )

    max_bytes = settings.audio_max_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="音频文件为空")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"音频文件超过 {settings.audio_max_mb} MB",
        )

    try:
        result = await SpeechClient.instance().transcribe(
            content=content,
            filename=filename,
            content_type=file.content_type or "application/octet-stream",
            language=language,
        )
    except SpeechTranscriptionError as exc:
        raise HTTPException(
            status_code=502,
            detail="语音识别暂时不可用，请稍后重试",
        ) from exc

    if not result["text"]:
        raise HTTPException(
            status_code=422,
            detail="没有识别到清晰语音，请靠近麦克风后重试",
        )
    return result


@router.post("/audio/speech")
async def synthesize_speech(payload: SpeechSynthesisRequest):
    """Synthesize bounded text and stream the generated audio without caching it."""
    settings = get_settings()
    text = " ".join(payload.text.split()).strip()
    if not text:
        raise HTTPException(status_code=400, detail="朗读内容不能为空")
    if len(text) > settings.tts_max_input_chars:
        raise HTTPException(
            status_code=413,
            detail=f"单次朗读内容不能超过 {settings.tts_max_input_chars} 个字符",
        )

    try:
        audio, content_type = await SpeechClient.instance().synthesize(text=text)
    except SpeechSynthesisError as exc:
        raise HTTPException(
            status_code=502,
            detail="语音合成暂时不可用，请稍后重试",
        ) from exc

    extension = "mp3" if content_type == "audio/mpeg" else settings.tts_response_format
    return Response(
        content=audio,
        media_type=content_type,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="speech.{extension}"',
        },
    )
