import json

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.core.settings import settings
from src.services.culture import culture_service

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    market: str = Field(default="AFRICA", max_length=16)
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    market: str


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    if not settings.deepseek_api_key:
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

    messages = [{"role": "system", "content": system_prompt}]
    for msg in request.history[-20:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    url = settings.deepseek_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": settings.deepseek_model,
        "messages": messages,
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
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

    return ChatResponse(reply=reply, market=request.market)
