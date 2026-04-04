from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes.chat import router as chat_router
from src.api.routes.culture import router as culture_router
from src.api.routes.jobs import router as jobs_router
from src.core.settings import settings

app = FastAPI(
    title="Agent Culture MVP",
    version="0.2.0",
    description="AI video agent for overseas cultural content creation, targeting Africa and other markets.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(culture_router, prefix="/api/v1")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WANGYE_DIR = PROJECT_ROOT / "wangye"
WEB_INDEX_FILE = Path(__file__).parent / "web" / "index.html"

if WANGYE_DIR.exists():
    app.mount("/app", StaticFiles(directory=WANGYE_DIR, html=True), name="wangye")


@app.get("/", response_model=None)
def index():
    # 主站 HTML 必须通过 /app/ 由 StaticFiles 提供，否则相对路径 styles.css / script.js
    # 会请求到 /styles.css（404），页面会丢失样式与脚本。
    if WANGYE_DIR.exists():
        return RedirectResponse(url="/app/")
    return FileResponse(WEB_INDEX_FILE)


@app.get("/console")
def console() -> FileResponse:
    return FileResponse(WEB_INDEX_FILE)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}
