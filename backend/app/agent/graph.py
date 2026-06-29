"""LangGraph StateGraph assembly (structured / non-streaming path and future use).
The streaming chat path lives in app/agent/service.py and uses session_log memory.
A durable checkpointer (PostgresSaver) can be supplied via db/checkpointer.py."""
from app.agent.nodes import (
    detect_intent,
    extract_knowledge,
    retrieve_context,
    update_graph,
)
from app.agent.state import LearningState


def _detect_intent_node(state: LearningState) -> dict:
    return {"intent": detect_intent(state)}


def _retrieve_node(state: LearningState) -> dict:
    return {"kg_context": retrieve_context(state)}


def _extract_node(state: LearningState) -> dict:
    return {"extracted": extract_knowledge(state)}


def _update_node(state: LearningState) -> dict:
    update_graph(state)
    return {}


def _route_after_retrieve(state: LearningState) -> str:
    return "practice" if state.get("intent") == "practice_answer" else "chat"


def build_graph(checkpointer=None):
    """Compile and return the graph. Caller must have langgraph installed.
    Pass checkpointer=db.checkpointer.get_checkpointer() for durable state."""
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(LearningState)
    builder.add_node("detect_intent", _detect_intent_node)
    builder.add_node("retrieve_context", _retrieve_node)
    builder.add_node("extract_knowledge", _extract_node)
    builder.add_node("update_graph", _update_node)

    builder.add_edge(START, "detect_intent")
    builder.add_edge("detect_intent", "retrieve_context")
    builder.add_conditional_edges(
        "retrieve_context",
        _route_after_retrieve,
        {"chat": "extract_knowledge", "practice": "extract_knowledge"},
    )
    builder.add_edge("extract_knowledge", "update_graph")
    builder.add_edge("update_graph", END)
    return builder.compile(checkpointer=checkpointer)
