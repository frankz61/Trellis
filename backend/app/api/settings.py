from fastapi import APIRouter
from pydantic import BaseModel

from app.user_settings import (
    clear_memory_user_settings,
    get_user_settings as load_user_settings,
    save_user_settings as persist_user_settings,
)

router = APIRouter(tags=["settings"])


class UserSettings(BaseModel):
    base_url: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    auto_save: bool = True


@router.get("/settings")
def get_user_settings(user_id: str):
    return load_user_settings(user_id)


@router.put("/settings")
def put_user_settings(user_id: str, body: UserSettings):
    return persist_user_settings(user_id, body.model_dump())


@router.delete("/data")
def delete_data(user_id: str, scope: str = "all"):
    try:
        from app.db.postgres import Postgres

        Postgres.instance().execute("DELETE FROM session_log WHERE user_id = %s", (user_id,))
        Postgres.instance().execute("DELETE FROM user_settings WHERE user_id = %s", (user_id,))
    except Exception as exc:  # noqa: BLE001
        print(f"[settings] PG delete skipped: {exc}", flush=True)
    clear_memory_user_settings(user_id)
    # TODO: also delete the user's Neo4j subgraph
    return {"deleted": True, "user_id": user_id, "scope": scope}
