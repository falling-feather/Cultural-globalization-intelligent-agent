from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    success = "success"
    failed = "failed"


class CreateJobRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=200)
    market: str = Field(default="AFRICA", min_length=2, max_length=16)
    audience_tags: list[str] = Field(default_factory=list)
    tone: str = Field(default="neutral", max_length=50)
    brand_voice_id: str | None = Field(
        default=None,
        max_length=32,
        description="Optional V2.0 brand voice rule pack id to inject.",
    )


class JobRecord(BaseModel):
    id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    request: CreateJobRequest
    result: dict[str, Any] | None = None
    error: str | None = None
