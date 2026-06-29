from __future__ import annotations

from neo4j import GraphDatabase

from app.config import get_settings
from app.kg import queries


class Neo4jClient:
    """Thin Neo4j driver wrapper (singleton)."""

    _instance: "Neo4jClient | None" = None

    def __init__(self) -> None:
        s = get_settings()
        self._driver = GraphDatabase.driver(s.neo4j_uri, auth=(s.neo4j_user, s.neo4j_password))

    @classmethod
    def instance(cls) -> "Neo4jClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def run(self, cypher: str, **params) -> list[dict]:
        with self._driver.session() as session:
            return [record.data() for record in session.run(cypher, **params)]

    def init_constraints(self) -> None:
        for stmt in queries.CONSTRAINTS:
            self.run(stmt)

    def close(self) -> None:
        self._driver.close()
