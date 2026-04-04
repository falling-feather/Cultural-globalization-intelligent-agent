from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.security import decode_token
from src.core.settings import settings

security_bearer = HTTPBearer()


@dataclass
class CurrentUser:
    username: str
    role: str


def client_ip_from_request(request: Request) -> str:
    if settings.trust_proxy_headers:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security_bearer)],
) -> CurrentUser:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    role = payload.get("role", "user")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return CurrentUser(username=sub, role=role)


def require_admin(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
