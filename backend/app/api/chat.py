import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent import astream_chat

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str
    scenario: str | None = None


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
