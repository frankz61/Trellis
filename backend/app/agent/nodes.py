"""Core logic for LangGraph nodes (reused by graph.py and service.py)."""
from collections.abc import AsyncIterator

from app.agent.state import LearningState
from app.agent.tools import get_user_mastery, update_user_state
from app.llm.client import LLMClient
from app.prompts import load_prompt

INTENTS = {"free_chat", "scenario_chat", "ask_word", "ask_grammar", "practice_answer"}


def _llm_kwargs(state: LearningState) -> dict:
    config = state.get("llm_config") or {}
    return {
        "base_url": config.get("base_url"),
        "model": config.get("model"),
        "temperature": config.get("temperature"),
        "max_tokens": config.get("max_tokens"),
    }


def detect_intent(state: LearningState) -> str:
    llm = LLMClient.instance()
    prompt = load_prompt("intent_detection").format(user_input=state["user_input"])
    try:
        label = llm.complete(
            [{"role": "user", "content": prompt}],
            purpose="detect_intent",
            **_llm_kwargs(state),
        ).strip().lower()
        return label if label in INTENTS else "free_chat"
    except Exception:  # noqa: BLE001
        return "free_chat"


def retrieve_context(state: LearningState) -> dict:
    try:
        return {"mastery": get_user_mastery(state["user_id"], scope="recent")}
    except Exception:  # noqa: BLE001
        return {"mastery": {}}


async def astream_reply(state: LearningState) -> AsyncIterator[str]:
    llm = LLMClient.instance()
    messages = [{"role": "system", "content": load_prompt("chat_companion")}]
    messages.extend(state.get("messages") or [])  # prior turns (conversation memory)
    messages.append({"role": "user", "content": state["user_input"]})
    try:
        async for token in llm.astream(messages, purpose="chat_reply", **_llm_kwargs(state)):
            yield token
    except Exception:  # noqa: BLE001
        # Fallback so the skeleton runs even without a configured LLM
        yield "(LLM not configured) I got your message: " + state["user_input"]


def extract_knowledge(state: LearningState) -> dict:
    llm = LLMClient.instance()
    prompt = load_prompt("knowledge_extraction").format(user_input=state["user_input"])
    try:
        return llm.complete_json(
            [{"role": "user", "content": prompt}],
            purpose="extract_knowledge",
            **_llm_kwargs(state),
        )
    except Exception:  # noqa: BLE001
        return {"mistakes": [], "words": [], "grammar": []}


def update_graph(state: LearningState) -> None:
    update_user_state(state["user_id"], state.get("extracted", {}))
