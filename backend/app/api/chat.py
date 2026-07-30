import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent import astream_chat
from app.db.history import list_sessions, session_history

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    scenario: str | None = None


@router.get("/chat/sessions")
def get_chat_sessions(user_id: str):
    """Return resumable conversations for the current user."""
    try:
        return list_sessions(user_id)
    except Exception as exc:  # noqa: BLE001
        print(f"[chat] session list unavailable: {exc}", flush=True)
        raise HTTPException(status_code=503, detail="Conversation history is unavailable") from exc


@router.get("/chat/history")
def get_chat_history(user_id: str, session_id: str):
    """Return persisted messages for one conversation."""
    try:
        return session_history(user_id, session_id)
    except Exception as exc:  # noqa: BLE001
        print(f"[chat] session history unavailable: {exc}", flush=True)
        raise HTTPException(status_code=503, detail="Conversation history is unavailable") from exc


@router.post("/chat")
async def chat(req: ChatRequest):
    """对话陪练（SSE 流式）。token 流 + 末尾 meta（纠错/生词）。"""

    async def event_stream():
        async for event in astream_chat(
            user_id=req.user_id,
            session_id=req.session_id,
            user_input=req.message,
            scenario=req.scenario,
        ):
            data = json.dumps(event["data"], ensure_ascii=False)
            yield f"event: {event['type']}\ndata: {data}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
