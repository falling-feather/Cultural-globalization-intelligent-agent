import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from starlette.requests import Request
from pydantic import BaseModel, Field

from src.api.deps import CurrentUser, client_ip_from_request, get_current_user, require_admin
from src.core.limiter import limiter
from src.core.security import create_access_token, verify_password
from src.services.auth_store import auth_store

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


class MeResponse(BaseModel):
    username: str
    role: str


@router.post("/auth/register", response_model=TokenResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest) -> TokenResponse:
    ip = client_ip_from_request(request)
    try:
        # 第一个注册用户自动成为 admin（便于无 .env 配置时初始化）
        role = "admin" if auth_store.count_users() == 0 else "user"
        record = auth_store.create_user(
            username=body.username.strip(),
            password=body.password,
            role=role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    auth_store.add_audit(
        username=record.username,
        client_ip=ip,
        action="register",
        detail={"role": record.role},
    )
    token = create_access_token(subject=record.username, role=record.role)
    return TokenResponse(access_token=token, username=record.username, role=record.role)


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest) -> TokenResponse:
    ip = client_ip_from_request(request)
    record = auth_store.get_user_by_username(body.username.strip())
    if record is None or not verify_password(body.password, record.password_hash):
        auth_store.add_audit(
            username=body.username.strip() or "unknown",
            client_ip=ip,
            action="login_failed",
            detail={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_access_token(subject=record.username, role=record.role)
    auth_store.add_audit(
        username=record.username,
        client_ip=ip,
        action="login_success",
        detail={},
    )
    return TokenResponse(access_token=token, username=record.username, role=record.role)


@router.get("/auth/me", response_model=MeResponse)
def me(user: Annotated[CurrentUser, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(username=user.username, role=user.role)


@router.post("/auth/logout")
def logout() -> dict[str, str]:
    return {"status": "ok", "message": "Client should discard token"}


@router.get("/admin/audit-logs")
def audit_logs(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_admin)],
    limit: int = 50,
    offset: int = 0,
) -> dict:
    ip = client_ip_from_request(request)
    auth_store.add_audit(
        username=user.username,
        client_ip=ip,
        action="admin_view_logs",
        detail={"limit": limit, "offset": offset},
    )
    items, total = auth_store.list_audit_logs(limit=min(limit, 200), offset=offset)
    return {"logs": items, "total": total}


@router.get("/admin/audit-logs/export")
def audit_logs_export(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_admin)],
    limit: int = 500,
) -> StreamingResponse:
    ip = client_ip_from_request(request)
    auth_store.add_audit(
        username=user.username,
        client_ip=ip,
        action="admin_export_logs",
        detail={"limit": limit},
    )
    items, _ = auth_store.list_audit_logs(limit=min(limit, 2000), offset=0)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "created_at", "username", "client_ip", "action", "detail"])
    for row in items:
        w.writerow(
            [
                row["id"],
                row["created_at"],
                row["username"],
                row["client_ip"],
                row["action"],
                row["detail"] or "",
            ]
        )

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )


@router.get("/admin/users")
def list_users(user: Annotated[CurrentUser, Depends(require_admin)]) -> dict:
    _ = user
    return {"users": auth_store.list_users()}


@router.delete("/admin/users/{username}")
def delete_user(
    request: Request,
    username: str,
    user: Annotated[CurrentUser, Depends(require_admin)],
) -> dict:
    if username == user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if not auth_store.delete_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    auth_store.add_audit(
        username=user.username,
        client_ip=client_ip_from_request(request),
        action="admin_delete_user",
        detail={"target": username},
    )
    return {"status": "ok", "deleted": username}


# ===== Model configuration (DeepSeek runtime override) =====
import json as _json  # noqa: E402

import httpx as _httpx  # noqa: E402

from src.services.runtime_config import runtime_config  # noqa: E402


class ModelConfigUpdate(BaseModel):
    deepseek_api_key: str | None = Field(default=None, max_length=200)
    deepseek_base_url: str | None = Field(default=None, max_length=200)
    deepseek_model: str | None = Field(default=None, max_length=80)


@router.get("/admin/model-config")
def get_model_config(user: Annotated[CurrentUser, Depends(require_admin)]) -> dict:
    _ = user
    return runtime_config.snapshot(mask_key=True)


@router.put("/admin/model-config")
def update_model_config(
    request: Request,
    body: ModelConfigUpdate,
    user: Annotated[CurrentUser, Depends(require_admin)],
) -> dict:
    try:
        snap = runtime_config.update(
            deepseek_api_key=body.deepseek_api_key,
            deepseek_base_url=body.deepseek_base_url,
            deepseek_model=body.deepseek_model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    auth_store.add_audit(
        username=user.username,
        client_ip=client_ip_from_request(request),
        action="admin_update_model_config",
        detail={
            "deepseek_base_url": snap["deepseek_base_url"],
            "deepseek_model": snap["deepseek_model"],
            "deepseek_api_key_set": snap["deepseek_api_key_set"],
        },
    )
    return snap


@router.post("/admin/model-config/test")
def test_model_config(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_admin)],
) -> dict:
    """实时调用 DeepSeek 一次，返回响应预览，便于诊断 API Key / Base URL / Model 是否正确。"""
    if not runtime_config.deepseek_api_key:
        raise HTTPException(status_code=400, detail="API Key 未配置")
    url = runtime_config.deepseek_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": runtime_config.deepseek_model,
        "messages": [
            {"role": "system", "content": "You are a connectivity test. Reply in one short Chinese sentence."},
            {"role": "user", "content": "请用一句话确认你能正常工作。"},
        ],
        "temperature": 0.2,
        "max_tokens": 60,
    }
    headers = {
        "Authorization": f"Bearer {runtime_config.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    auth_store.add_audit(
        username=user.username,
        client_ip=client_ip_from_request(request),
        action="admin_test_model_config",
        detail={"model": runtime_config.deepseek_model, "base_url": runtime_config.deepseek_base_url},
    )
    try:
        with _httpx.Client(timeout=30) as client:
            resp = client.post(url, headers=headers, content=_json.dumps(payload))
    except _httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"网络请求失败：{exc}") from exc
    if resp.status_code >= 400:
        body_text = resp.text[:400]
        raise HTTPException(
            status_code=502,
            detail=f"DeepSeek 返回 {resp.status_code}：{body_text}",
        )
    try:
        data = resp.json()
        reply = data["choices"][0]["message"]["content"].strip()
        usage = data.get("usage", {})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"响应解析失败：{exc}") from exc
    return {
        "ok": True,
        "model": runtime_config.deepseek_model,
        "base_url": runtime_config.deepseek_base_url,
        "reply": reply,
        "usage": usage,
    }
