"""Conversation memory backed by PostgreSQL session_log.

This is the practical memory used by the SSE chat path (service.py):
recent turns are loaded into the LLM context and each turn is appended here.
(LangGraph PostgresSaver is available for the graph path; see db/checkpointer.py.)
"""
from app.db.postgres import Postgres


def append_turn(user_id: str, session_id: str, role: str, content: str,
                intent: str | None = None) -> None:
    Postgres.instance().execute(
        "INSERT INTO session_log (user_id, session_id, role, content, intent) "
        "VALUES (%s, %s, %s, %s, %s)",
        (user_id, session_id, role, content, intent),
    )


def recent_turns(user_id: str, session_id: str, limit: int = 10) -> list[dict]:
    rows = Postgres.instance().query(
        "SELECT role, content FROM session_log "
        "WHERE user_id = %s AND session_id = %s ORDER BY id DESC LIMIT %s",
        (user_id, session_id, limit),
    )
    return list(reversed(rows))


def list_sessions(user_id: str, limit: int = 50) -> list[dict]:
    """List a user's conversations, newest activity first."""
    return Postgres.instance().query(
        """
        SELECT
            session_id,
            COALESCE(
                (ARRAY_AGG(content ORDER BY id) FILTER (WHERE role = 'user'))[1],
                '新对话'
            ) AS title,
            MAX(created_at) AS updated_at,
            COUNT(*)::INTEGER AS message_count
        FROM session_log
        WHERE user_id = %s
        GROUP BY session_id
        ORDER BY updated_at DESC
        LIMIT %s
        """,
        (user_id, limit),
    )


def session_history(user_id: str, session_id: str, limit: int = 200) -> list[dict]:
    """Return the latest messages in chronological order for one conversation."""
    return Postgres.instance().query(
        """
        SELECT id, role, content, created_at
        FROM (
            SELECT id, role, content, created_at
            FROM session_log
            WHERE user_id = %s AND session_id = %s
            ORDER BY id DESC
            LIMIT %s
        ) AS recent
        ORDER BY id ASC
        """,
        (user_id, session_id, limit),
    )
