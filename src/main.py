from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from src.api.routes.jobs import router as jobs_router
from src.core.settings import settings

app = FastAPI(
    title="Agent Culture MVP",
    version="0.1.0",
    description="AI video agent skeleton for overseas market content generation.",
)

app.include_router(jobs_router, prefix="/api/v1")

WEB_INDEX_FILE = Path(__file__).parent / "web" / "index.html"


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_INDEX_FILE)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}
