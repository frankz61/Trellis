from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings

_DDL = [
    """
    CREATE TABLE IF NOT EXISTS session_log (
        id          BIGSERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        session_id  TEXT NOT NULL,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        intent      TEXT,
        created_at  TIMESTAMPTZ DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_session_log ON session_log (user_id, session_id, created_at)",
    """
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id     TEXT PRIMARY KEY,
        base_url    TEXT,
        model_name  TEXT,
        temperature REAL,
        auto_save   BOOLEAN DEFAULT true,
        updated_at  TIMESTAMPTZ DEFAULT now()
    )
    """,
]


class Postgres:
    """Thin PostgreSQL helper (singleton). Short-lived connections per call."""

    _instance: "Postgres | None" = None

    def __init__(self) -> None:
        self._dsn = get_settings().database_url

    @classmethod
    def instance(cls) -> "Postgres":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _connect(self):
        return psycopg.connect(self._dsn, row_factory=dict_row)

    def init_tables(self) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            for stmt in _DDL:
                cur.execute(stmt)
            conn.commit()

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
