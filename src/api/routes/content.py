from typing import Annotated, Literal

import httpx
import trafilatura
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from starlette.requests import Request

from src.api.deps import CurrentUser, get_current_user
from src.core.limiter import limiter
from src.core.settings import settings
from src.services.culture import culture_service
from src.services.providers import ProviderError, summarize_content_for_market
from src.services.url_safety import UnsafeUrlError, assert_url_safe_for_fetch

router = APIRouter(tags=["content"])


class SummarizeRequest(BaseModel):
    source_type: Literal["url", "text"] = "text"
    url: str | None = Field(default=None, max_length=2048)
    text: str | None = Field(default=None, max_length=50000)
    market: str = Field(default="AFRICA", max_length=16)


class SummarizeResponse(BaseModel):
    summary: str
    market: str
    source_preview: str


@router.post("/content/summarize", response_model=SummarizeResponse)
@limiter.limit("15/minute")
def summarize_content(
    request: Request,
    body: SummarizeRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> SummarizeResponse:
    _ = user
    market_rules = culture_service.get_market_rules(body.market)
    raw_text = ""

    if body.source_type == "url":
        if not body.url or not body.url.strip():
            raise HTTPException(status_code=400, detail="url is required when source_type is url")
        try:
            safe_url = assert_url_safe_for_fetch(body.url)
        except UnsafeUrlError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AgentCulture/1.0; +https://github.com/falling-feather/Cultural-globalization-intelligent-agent)",
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        }
        try:
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                with client.stream("GET", safe_url, headers=headers) as resp:
                    if resp.status_code >= 400:
                        raise HTTPException(status_code=502, detail=f"Fetch failed: HTTP {resp.status_code}")
                    chunks: list[bytes] = []
                    total = 0
                    for chunk in resp.iter_bytes():
                        total += len(chunk)
                        if total > settings.fetch_max_bytes:
                            break
                        chunks.append(chunk)
                    html = b"".join(chunks).decode(resp.encoding or "utf-8", errors="replace")
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Fetch error: {exc}") from exc

        extracted = trafilatura.extract(html, include_comments=False, include_tables=False)
        raw_text = (extracted or "").strip()
        if not raw_text:
            raw_text = trafilatura.extract(html, favor_recall=True, include_comments=False) or ""
            raw_text = raw_text.strip()
        if not raw_text:
            raise HTTPException(status_code=422, detail="Could not extract readable text from URL")
    else:
        if not body.text or not body.text.strip():
            raise HTTPException(status_code=400, detail="text is required when source_type is text")
        raw_text = body.text.strip()

    max_c = settings.summarize_max_chars
    preview = raw_text[:500] + ("…" if len(raw_text) > 500 else "")
    if len(raw_text) > max_c:
        raw_text = raw_text[:max_c]

    try:
        summary = summarize_content_for_market(raw_text, body.market, market_rules)
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return SummarizeResponse(summary=summary, market=body.market, source_preview=preview)
