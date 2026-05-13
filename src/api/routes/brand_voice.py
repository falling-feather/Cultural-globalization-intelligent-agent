"""V2.0 品牌音调库 API。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.deps import CurrentUser, get_current_user
from src.services.brand_voice_store import (
    BrandVoiceRecord,
    brand_voice_store,
)

router = APIRouter(tags=["brand-voice"], prefix="/brand-voices")


class BrandVoiceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    keywords: list[str] = Field(default_factory=list, max_length=30)
    banned_words: list[str] = Field(default_factory=list, max_length=30)
    style_notes: str = Field(default="", max_length=2000)


class BrandVoiceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    keywords: list[str] | None = Field(default=None, max_length=30)
    banned_words: list[str] | None = Field(default=None, max_length=30)
    style_notes: str | None = Field(default=None, max_length=2000)


def _to_dict(r: BrandVoiceRecord) -> dict:
    return {
        "id": r.id,
        "owner": r.owner_username,
        "name": r.name,
        "keywords": r.keywords,
        "banned_words": r.banned_words,
        "style_notes": r.style_notes,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


@router.get("")
def list_brand_voices(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> dict:
    items = brand_voice_store.list_for_user(
        username=user.username, is_admin=user.role == "admin"
    )
    return {"items": [_to_dict(i) for i in items], "total": len(items)}


@router.post("")
def create_brand_voice(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    body: BrandVoiceCreate,
) -> dict:
    rec = brand_voice_store.create(
        owner_username=user.username,
        name=body.name,
        keywords=body.keywords,
        banned_words=body.banned_words,
        style_notes=body.style_notes,
    )
    return _to_dict(rec)


@router.get("/{voice_id}")
def get_brand_voice(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    voice_id: str,
) -> dict:
    rec = brand_voice_store.get_for_user(
        voice_id=voice_id,
        username=user.username,
        is_admin=user.role == "admin",
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="brand voice not found")
    return _to_dict(rec)


@router.put("/{voice_id}")
def update_brand_voice(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    voice_id: str,
    body: BrandVoiceUpdate,
) -> dict:
    rec = brand_voice_store.update(
        voice_id=voice_id,
        username=user.username,
        is_admin=user.role == "admin",
        name=body.name,
        keywords=body.keywords,
        banned_words=body.banned_words,
        style_notes=body.style_notes,
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="brand voice not found")
    return _to_dict(rec)


@router.delete("/{voice_id}")
def delete_brand_voice(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    voice_id: str,
) -> dict:
    ok = brand_voice_store.delete_for_user(
        voice_id=voice_id,
        username=user.username,
        is_admin=user.role == "admin",
    )
    if not ok:
        raise HTTPException(status_code=404, detail="brand voice not found")
    return {"status": "ok", "deleted": voice_id}
