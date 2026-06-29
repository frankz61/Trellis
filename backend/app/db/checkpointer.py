"""Optional LangGraph PostgresSaver factory for the graph path.

The SSE chat path uses session_log for memory (see db/history.py); this is here
so the documented graph (agent/graph.py) can be compiled with durable checkpoints.
"""
from app.config import get_settings


def get_checkpointer():
    """Create and set up a PostgresSaver. Requires langgraph-checkpoint-postgres.

    Note: PostgresSaver.from_conn_string returns a context manager; callers that
    keep the graph alive should manage its lifecycle (or enter it at startup).
    """
    from langgraph.checkpoint.postgres import PostgresSaver

    cm = PostgresSaver.from_conn_string(get_settings().database_url)
    saver = cm.__enter__()
    saver.setup()
    return saver
