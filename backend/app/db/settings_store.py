"""User settings persisted in PostgreSQL user_settings."""
from app.db.postgres import Postgres


def get_settings_row(user_id: str) -> dict | None:
    rows = Postgres.instance().query(
        "SELECT base_url, model_name, temperature, auto_save "
        "FROM user_settings WHERE user_id = %s",
        (user_id,),
    )
    return rows[0] if rows else None


def upsert_settings(user_id: str, base_url, model_name, temperature, auto_save) -> None:
    Postgres.instance().execute(
        """
        INSERT INTO user_settings (user_id, base_url, model_name, temperature, auto_save, updated_at)
        VALUES (%s, %s, %s, %s, %s, now())
        ON CONFLICT (user_id) DO UPDATE SET
            base_url = EXCLUDED.base_url,
            model_name = EXCLUDED.model_name,
            temperature = EXCLUDED.temperature,
            auto_save = EXCLUDED.auto_save,
            updated_at = now()
        """,
        (user_id, base_url, model_name, temperature, auto_save),
    )
