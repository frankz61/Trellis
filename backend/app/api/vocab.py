from fastapi import APIRouter

from app.kg import queries
from app.kg.neo4j_client import Neo4jClient

router = APIRouter(tags=["vocab"])


@router.get("/vocab")
def vocab(user_id: str):
    try:
        return Neo4jClient.instance().run(queries.LIST_VOCAB, uid=user_id)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc), "items": []}
