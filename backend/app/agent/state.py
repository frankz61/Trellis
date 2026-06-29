from typing import Annotated, TypedDict

try:
    from langgraph.graph.message import add_messages
except Exception:  # langgraph not installed yet
    def add_messages(left, right):  # type: ignore
        return (left or []) + (right or [])


class LearningState(TypedDict, total=False):
    user_id: str
    session_id: str
    messages: Annotated[list, add_messages]
    user_input: str
    scenario: str | None
    intent: str
    kg_context: dict
    llm_config: dict
    agent_reply: str
    extracted: dict


def new_state(user_id: str, session_id: str, user_input: str,
              scenario: str | None = None) -> LearningState:
    return LearningState(
        user_id=user_id,
        session_id=session_id,
        messages=[],
        user_input=user_input,
        scenario=scenario,
        intent="",
        kg_context={},
        llm_config={},
        agent_reply="",
        extracted={},
    )
