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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


class MeResponse(BaseModel):
    username: str
    role: str


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
