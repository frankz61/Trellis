"""Agent tools: read/write Neo4j, generate/score exercises."""
import uuid

from app.kg import queries
from app.kg.neo4j_client import Neo4jClient
from app.llm.client import LLMClient
from app.prompts import load_prompt
from app.user_settings import get_effective_llm_config


def _llm_kwargs_for_user(user_id: str | None) -> dict:
    if not user_id:
        return {}
    config = get_effective_llm_config(user_id)
    print(
        "[llm] effective_config "
        f"user_id={user_id} source={config.get('source')} "
        f"model={config.get('model')} base_url={config.get('base_url')} "
        f"temperature={config.get('temperature')} max_tokens={config.get('max_tokens')}",
        flush=True,
    )
    return {
        "base_url": config.get("base_url"),
        "model": config.get("model"),
        "temperature": config.get("temperature"),
        "max_tokens": config.get("max_tokens"),
    }


def query_knowledge_graph(entity: str) -> dict:
    rows = Neo4jClient.instance().run(queries.QUERY_WORD, lemma=entity)
    return rows[0] if rows else {}


def get_user_mastery(user_id: str, scope: str = "recent") -> dict:
    weak = Neo4jClient.instance().run(queries.GET_WEAK_POINTS, uid=user_id)
    return {"weak_points": weak}


def update_user_state(user_id: str, extracted: dict) -> None:
    client = Neo4jClient.instance()
    for m in extracted.get("mistakes", []):
        client.run(
            queries.UPSERT_MISTAKE,
            uid=user_id,
            mid=str(uuid.uuid4()),
            orig=m.get("orig", ""),
            corr=m.get("fix", ""),
            type=m.get("type", "word_choice"),
            exp=m.get("explanation", ""),
            grammar=m.get("type", "word_choice"),
        )
    for w in extracted.get("words", []):
        client.run(
            queries.UPSERT_WORD_KNOWN,
            uid=user_id,
            lemma=w.get("lemma", ""),
            meaning=w.get("meaning_cn", ""),
        )


def generate_exercise(
    item: str,
    target_kind: str = "word",
    level: str = "B2",
    user_id: str | None = None,
) -> dict:
    """Generate an exercise targeting a word/grammar point and persist it."""
    llm = LLMClient.instance()
    prompt = load_prompt("exercise_generation").format(item=item, kind=target_kind, level=level)
    try:
        ex = llm.complete_json(
            [{"role": "user", "content": prompt}],
            purpose="generate_exercise",
            **_llm_kwargs_for_user(user_id),
        )
    except Exception:  # noqa: BLE001
        ex = {"kind": "cloze", "prompt": f"(placeholder) make a sentence with {item}", "answer": ""}
    ex["id"] = str(uuid.uuid4())
    ex["target"] = item
    ex["target_kind"] = target_kind
    try:
        q = queries.CREATE_EXERCISE_WORD if target_kind == "word" else queries.CREATE_EXERCISE_GRAMMAR
        Neo4jClient.instance().run(
            q,
            eid=ex["id"],
            kind=ex.get("kind", "cloze"),
            prompt=ex.get("prompt", ""),
            answer=ex.get("answer", ""),
            target=item,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[tools] persist exercise failed: {exc}")
    return ex


def get_due_reviews(user_id: str) -> list[dict]:
    try:
        return Neo4jClient.instance().run(queries.GET_DUE_REVIEWS, uid=user_id)
    except Exception:  # noqa: BLE001
        return []


def score_practice(user_id: str, exercise_id: str, answer: str) -> dict:
    llm = LLMClient.instance()
    prompt = load_prompt("practice_scoring").format(answer=answer)
    try:
        result = llm.complete_json(
            [{"role": "user", "content": prompt}],
            purpose="score_practice",
            **_llm_kwargs_for_user(user_id),
        )
    except Exception:  # noqa: BLE001
        result = {"correct": False, "feedback": "(LLM not configured)", "mastery_delta": 0}
    delta = int(result.get("mastery_delta", 0) or 0)
    result["new_mastery"] = _apply_mastery(user_id, exercise_id, delta)
    return result


def _apply_mastery(user_id: str, exercise_id: str, delta: int):
    """Write mastery change back to Neo4j based on the exercise's target."""
    try:
        client = Neo4jClient.instance()
        rows = client.run(queries.GET_EXERCISE_TARGET, eid=exercise_id)
        if not rows:
            return None
        target_type, target_key = rows[0]["target_type"], rows[0]["target_key"]
        if target_type == "Word":
            out = client.run(queries.UPDATE_WORD_MASTERY, uid=user_id, key=target_key, delta=delta)
            return out[0]["new_mastery"] if out else None
        if target_type == "GrammarPoint":
            # a correct answer (positive delta) should reduce weakness count
            out = client.run(queries.ADJUST_WEAK_POINT, uid=user_id, key=target_key, delta=-delta)
            return {"weak_count": out[0]["new_count"]} if out else None
    except Exception as exc:  # noqa: BLE001
        print(f"[tools] mastery write-back failed: {exc}")
    return None
