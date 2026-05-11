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
from src.services.material_store import material_store
from src.services.providers import (
    ProviderError,
    extract_structured_material,
    summarize_content_for_market,
)
from src.services.url_safety import UnsafeUrlError, assert_url_safe_for_fetch

router = APIRouter(tags=["content"])

# Cap raw text passed to LLMs (≈ 8 KB / chars)
RAW_TEXT_HARD_CAP = 8000


class SummarizeRequest(BaseModel):
    source_type: Literal["url", "text"] = "text"
    url: str | None = Field(default=None, max_length=2048)
    text: str | None = Field(default=None, max_length=50000)
    market: str = Field(default="AFRICA", max_length=16)
    extract: bool = Field(
        default=False,
        description="If true, run Step-2 to also produce a structured material draft.",
    )


class StructuredMaterial(BaseModel):
    title: str
    tone_observed: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    taboo_hits: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    key_quotes: list[str] = Field(default_factory=list)


class SummarizeResponse(BaseModel):
    summary: str
    market: str
    source_preview: str
    raw_excerpt: str
    source_type: str
    source_url: str = ""
    structured: StructuredMaterial | None = None


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
    source_url = ""

    if body.source_type == "url":
        if not body.url or not body.url.strip():
            raise HTTPException(status_code=400, detail="url is required when source_type is url")
        try:
            safe_url = assert_url_safe_for_fetch(body.url)
        except UnsafeUrlError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        source_url = safe_url

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Upgrade-Insecure-Requests": "1",
        }
        html = ""
        last_err: Exception | None = None
        # 兼容部分站点提前关闭 TLS 连接 / HTTP/2 异常：HTTP/1.1 + 重试 3 次
        transport = httpx.HTTPTransport(retries=2, http2=False)
        for attempt in range(3):
            try:
                with httpx.Client(
                    timeout=httpx.Timeout(30.0, connect=10.0),
                    follow_redirects=True,
                    transport=transport,
                    headers=headers,
                ) as client:
                    with client.stream("GET", safe_url) as resp:
                        if resp.status_code >= 400:
                            raise HTTPException(
                                status_code=502,
                                detail=f"目标站点返回 HTTP {resp.status_code}",
                            )
                        chunks: list[bytes] = []
                        total = 0
                        for chunk in resp.iter_bytes():
                            total += len(chunk)
                            if total > settings.fetch_max_bytes:
                                break
                            chunks.append(chunk)
                        html = b"".join(chunks).decode(
                            resp.encoding or "utf-8", errors="replace"
                        )
                last_err = None
                break
            except HTTPException:
                raise
            except (httpx.RequestError, OSError) as exc:
                last_err = exc
                continue
        if last_err is not None or not html:
            msg = str(last_err) if last_err else "无内容返回"
            low = msg.lower()
            if "ssl" in low or "eof" in low or "handshake" in low or "tls" in low:
                friendly = (
                    "目标站点 TLS 握手失败或提前关闭连接（已重试 3 次）。"
                    "该站点可能拒绝非浏览器访问，请改用「粘贴正文」方式。"
                )
            elif "timeout" in low or "timed out" in low:
                friendly = "目标站点响应超时（已重试 3 次），请稍后再试或改用「粘贴正文」方式。"
            elif "connect" in low or "dns" in low or "name or service" in low:
                friendly = "无法连接目标站点（DNS / 防火墙 / 站点不可达）。"
            else:
                friendly = f"抓取失败：{msg}"
            raise HTTPException(status_code=502, detail=friendly)

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

    max_c = min(settings.summarize_max_chars, RAW_TEXT_HARD_CAP)
    preview = raw_text[:500] + ("…" if len(raw_text) > 500 else "")
    if len(raw_text) > max_c:
        raw_text = raw_text[:max_c]
    raw_excerpt = raw_text[:RAW_TEXT_HARD_CAP]

    try:
        summary = summarize_content_for_market(raw_text, body.market, market_rules)
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    structured: StructuredMaterial | None = None
    if body.extract:
        try:
            data = extract_structured_material(
                summary_md=summary,
                raw_text=raw_text,
                market=body.market,
                market_rules=market_rules,
                source_url=source_url,
            )
            structured = StructuredMaterial(**data)
        except ProviderError as exc:
            # 不阻塞主流程，仅在响应里告知抽取失败
            structured = StructuredMaterial(
                title="结构化抽取失败",
                risks=[str(exc)[:200]],
            )

    return SummarizeResponse(
        summary=summary,
        market=body.market,
        source_preview=preview,
        raw_excerpt=raw_excerpt,
        source_type=body.source_type,
        source_url=source_url,
        structured=structured,
    )


# ===== Material library endpoints =====


def _record_to_dict(rec) -> dict:
    return {
        "id": rec.id,
        "owner": rec.owner_username,
        "market": rec.market,
        "title": rec.title,
        "source_type": rec.source_type,
        "source_url": rec.source_url,
        "summary_md": rec.summary_md,
        "raw_excerpt": rec.raw_excerpt,
        "structured": rec.structured,
        "created_at": rec.created_at,
    }


class MaterialCreate(BaseModel):
    market: str = Field(..., max_length=32)
    title: str = Field(..., max_length=200)
    source_type: Literal["url", "text"] = "text"
    source_url: str = Field(default="", max_length=2048)
    summary_md: str = Field(default="", max_length=20000)
    raw_excerpt: str = Field(default="", max_length=20000)
    structured: dict = Field(default_factory=dict)


@router.get("/materials")
def list_materials(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    market: str | None = None,
    limit: int = 100,
) -> dict:
    items = material_store.list_for_user(
        username=user.username,
        is_admin=user.role == "admin",
        market=market,
        limit=limit,
    )
    return {"items": [_record_to_dict(it) for it in items]}


@router.get("/materials/{material_id}")
def get_material(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    material_id: str,
) -> dict:
    rec = material_store.get_for_user(
        material_id=material_id,
        username=user.username,
        is_admin=user.role == "admin",
    )
    if rec is None:
        raise HTTPException(status_code=404, detail="material not found")
    return _record_to_dict(rec)


@router.post("/materials", status_code=201)
@limiter.limit("30/minute")
def create_material(
    request: Request,
    body: MaterialCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> dict:
    _ = request
    try:
        rec = material_store.create(
            owner_username=user.username,
            market=body.market,
            title=body.title,
            source_type=body.source_type,
            source_url=body.source_url,
            summary_md=body.summary_md,
            raw_excerpt=body.raw_excerpt,
            structured=body.structured,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _record_to_dict(rec)


@router.delete("/materials/{material_id}")
def delete_material(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    material_id: str,
) -> dict:
    ok = material_store.delete_for_user(
        material_id=material_id,
        username=user.username,
        is_admin=user.role == "admin",
    )
    if not ok:
        raise HTTPException(status_code=404, detail="material not found or not owned")
    return {"status": "ok", "deleted": material_id}
