"""V2.0 反馈闭环 API。"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.api.deps import CurrentUser, get_current_user, require_admin
from src.services.feedback_store import feedback_store

router = APIRouter(tags=["feedback"])


class FeedbackCreate(BaseModel):
    market: str = Field(default="DEFAULT", max_length=32)
    source: Literal["chat", "score", "job"] = "chat"
    rating: int = Field(..., description="+1 表示有用，-1 表示无用")
    comment: str = Field(default="", max_length=500)
    message_excerpt: str = Field(default="", max_length=500)


@router.post("/feedback")
def create_feedback(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    body: FeedbackCreate,
) -> dict:
    if body.rating not in (-1, 1):
        raise HTTPException(status_code=400, detail="rating must be -1 or 1")
    rec = feedback_store.add(
        username=user.username,
        market=body.market,
        source=body.source,
        rating=body.rating,
        comment=body.comment,
        message_excerpt=body.message_excerpt,
    )
    return {"status": "ok", "id": rec.id}


@router.get("/admin/feedback/stats")
def admin_feedback_stats(
    _user: Annotated[CurrentUser, Depends(require_admin)],
) -> dict:
    return feedback_store.stats()


@router.get("/admin/feedback/list")
def admin_feedback_list(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return {"items": feedback_store.list_recent(limit=limit)}
