from fastapi import APIRouter
from pydantic import BaseModel

from app.agent.tools import generate_exercise, get_due_reviews, score_practice

router = APIRouter(tags=["reviews"])


@router.get("/reviews/today")
def reviews_today(user_id: str):
    """Pick weak-point review items and generate a targeted exercise for each."""
    items = get_due_reviews(user_id)
    return [
        {
            **item,
            "exercise": generate_exercise(
                item["item"],
                target_kind=item["kind"],
                level="B2",
                user_id=user_id,
            ),
        }
        for item in items
    ]


class AnswerRequest(BaseModel):
    user_id: str
    exercise_id: str
    answer: str


@router.post("/practice/answer")
def practice_answer(req: AnswerRequest):
    return score_practice(req.user_id, req.exercise_id, req.answer)
