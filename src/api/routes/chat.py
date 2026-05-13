import json
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.deps import CurrentUser, get_current_user
from src.core.settings import settings
from src.services.brand_voice_store import brand_voice_store, render_brand_voice_block
from src.services.culture import culture_service
from src.services.material_store import material_store
from src.services.runtime_config import runtime_config

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    market: str = Field(default="AFRICA", max_length=16)
    history: list[ChatMessage] = Field(default_factory=list)
    material_ids: list[str] = Field(default_factory=list, max_length=10)
    brand_voice_id: str | None = Field(default=None, max_length=32)


class ChatResponse(BaseModel):
    reply: str
    market: str
    used_material_ids: list[str] = Field(default_factory=list)
    used_brand_voice: str | None = None


def _build_material_block(records) -> str:
    if not records:
        return ""
    lines = [
        "",
        "=== Referenced cultural materials (use them as factual context) ===",
    ]
    for rec in records:
        s = rec.structured or {}
        lines.append(f"## [{rec.market}] {rec.title}")
        if rec.source_url:
            lines.append(f"Source: {rec.source_url}")
        if s.get("tone_observed"):
            lines.append("Observed tone: " + ", ".join(s["tone_observed"]))
        if s.get("risks"):
            lines.append("Risks: " + "; ".join(s["risks"]))
        if s.get("taboo_hits"):
            lines.append("Taboo hits: " + ", ".join(s["taboo_hits"]))
        if s.get("tags"):
            lines.append("Tags: " + ", ".join(s["tags"]))
        if s.get("key_quotes"):
            lines.append("Key quotes:")
            for q in s["key_quotes"]:
                lines.append(f"- {q}")
        if rec.summary_md:
            md = rec.summary_md.strip()
            if len(md) > 1500:
                md = md[:1500] + "…"
            lines.append("Summary:")
            lines.append(md)
        lines.append("")
    return "\n".join(lines)


@router.post("/chat", response_model=ChatResponse)
def chat(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    request: ChatRequest,
) -> ChatResponse:
    if not runtime_config.deepseek_api_key:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured")

    market_rules = culture_service.get_market_rules(request.market)
    tone_prefs = ", ".join(market_rules.get("tone_preferences", ["clear"]))
    taboo_terms = ", ".join(market_rules.get("taboo_terms", [])) or "none"
    language = market_rules.get("language", "en")

    system_prompt = (
        "You are an AI assistant specialized in cross-cultural video content creation "
        f"for the {request.market} market. "
        f"Communicate primarily in {language}. "
        f"Preferred tones: {tone_prefs}. "
        f"Avoid these taboo terms: {taboo_terms}. "
        "Help users plan video scripts, choose cultural strategies, and optimize content for overseas audiences. "
        "Be concise, practical, and culturally sensitive."
    )

    used_ids: list[str] = []
    if request.material_ids:
        records = material_store.get_many_for_user(
            material_ids=request.material_ids,
            username=user.username,
            is_admin=user.role == "admin",
        )
        if records:
            system_prompt += _build_material_block(records)
            used_ids = [r.id for r in records]

    used_brand: str | None = None
    if request.brand_voice_id:
        bv = brand_voice_store.get_for_user(
            voice_id=request.brand_voice_id,
            username=user.username,
            is_admin=user.role == "admin",
        )
        if bv:
            system_prompt += render_brand_voice_block(bv)
            used_brand = bv.name

    messages = [{"role": "system", "content": system_prompt}]
    for msg in request.history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    url = runtime_config.deepseek_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": runtime_config.deepseek_model,
        "messages": messages,
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {runtime_config.deepseek_api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=60) as client:
            response = client.post(url, headers=headers, content=json.dumps(payload))

        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"DeepSeek API error: {response.status_code}")

        data = response.json()
        reply = data["choices"][0]["message"]["content"].strip()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DeepSeek request failed: {exc}") from exc

    return ChatResponse(
        reply=reply,
        market=request.market,
        used_material_ids=used_ids,
        used_brand_voice=used_brand,
    )
