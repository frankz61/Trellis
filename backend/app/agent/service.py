"""Chat companion SSE orchestration: stream the reply first, then extract and
persist knowledge in the background (do not interrupt the conversation).

Conversation memory is backed by PostgreSQL session_log (db/history.py):
prior turns are loaded into the context and each turn is appended.
"""
from collections.abc import AsyncIterator

from app.agent.nodes import (
    astream_reply,
    detect_intent,
    extract_knowledge,
    retrieve_context,
    update_graph,
)
from app.agent.state import new_state
from app.user_settings import get_effective_llm_config


def _safe_log(user_id: str, session_id: str, role: str, content: str,
              intent: str | None = None) -> None:
    try:
        from app.db.history import append_turn

        append_turn(user_id, session_id, role, content, intent)
    except Exception as exc:  # noqa: BLE001
        print(f"[agent] session_log skipped: {exc}")


def _load_history(user_id: str, session_id: str) -> list[dict]:
    try:
        from app.db.history import recent_turns

        return recent_turns(user_id, session_id, limit=10)
    except Exception as exc:  # noqa: BLE001
        print(f"[agent] history load skipped: {exc}")
        return []


async def astream_chat(user_id: str, session_id: str, user_input: str,
                       scenario: str | None = None) -> AsyncIterator[dict]:
    state = new_state(user_id, session_id, user_input, scenario)
    state["llm_config"] = get_effective_llm_config(user_id)
    print(
        "[llm] effective_config "
        f"user_id={user_id} source={state['llm_config'].get('source')} "
        f"model={state['llm_config'].get('model')} "
        f"base_url={state['llm_config'].get('base_url')} "
        f"temperature={state['llm_config'].get('temperature')} "
        f"max_tokens={state['llm_config'].get('max_tokens')}",
        flush=True,
    )
    state["intent"] = detect_intent(state)
    state["kg_context"] = retrieve_context(state)
    state["messages"] = _load_history(user_id, session_id)

    _safe_log(user_id, session_id, "user", user_input, state["intent"])

    parts: list[str] = []
    async for token in astream_reply(state):
        parts.append(token)
        yield {"type": "token", "data": {"delta": token}}
    state["agent_reply"] = "".join(parts)
    _safe_log(user_id, session_id, "assistant", state["agent_reply"])

    state["extracted"] = extract_knowledge(state)
    try:
        update_graph(state)
    except Exception as exc:  # noqa: BLE001
        print(f"[agent] update_graph failed: {exc}")

    yield {
        "type": "meta",
        "data": {
            "corrections": state["extracted"].get("mistakes", []),
            "new_words": [w.get("lemma") for w in state["extracted"].get("words", [])],
        },
    }
    yield {"type": "done", "data": {}}
