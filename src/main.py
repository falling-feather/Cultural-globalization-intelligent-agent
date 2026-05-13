from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api.deps import client_ip_from_request
from src.api.routes.auth import router as auth_router
from src.api.routes.brand_voice import router as brand_voice_router
from src.api.routes.chat import router as chat_router
from src.api.routes.content import router as content_router
from src.api.routes.culture import router as culture_router
from src.api.routes.feedback import router as feedback_router
from src.api.routes.jobs import router as jobs_router
from src.core.limiter import limiter
from src.core.security import decode_token
from src.core.settings import settings
from src.services.auth_store import auth_store

app = FastAPI(
    title="Agent Culture MVP",
    version="0.3.0",
    description="AI video agent for overseas cultural content creation, targeting Africa and other markets.",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    response = await call_next(request)
    try:
        path = request.url.path
        if not path.startswith("/api/v1"):
            return response
        if path == "/api/v1/auth/login":
            return response
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return response
        username = "anonymous"
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            payload = decode_token(auth_header[7:].strip())
            if payload and payload.get("sub"):
                username = str(payload["sub"])
        auth_store.add_audit(
            username=username,
            client_ip=client_ip_from_request(request),
            action=f"{request.method} {path}",
            detail={"status_code": response.status_code},
        )
    except Exception:
        pass
    return response


app.include_router(auth_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(culture_router, prefix="/api/v1")
app.include_router(content_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(brand_voice_router, prefix="/api/v1")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WANGYE_DIR = PROJECT_ROOT / "wangye"
WEB_INDEX_FILE = Path(__file__).parent / "web" / "index.html"

if WANGYE_DIR.exists():
    app.mount("/app", StaticFiles(directory=WANGYE_DIR, html=True), name="wangye")


@app.get("/", response_model=None)
def index():
    if WANGYE_DIR.exists():
        return RedirectResponse(url="/app/")
    return FileResponse(WEB_INDEX_FILE)


@app.get("/console")
def console() -> FileResponse:
    return FileResponse(WEB_INDEX_FILE)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}
