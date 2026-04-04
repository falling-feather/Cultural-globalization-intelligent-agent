import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from src.models.schemas import CreateJobRequest, JobRecord
from src.services.pipeline import pipeline_service
from src.services.task_store import task_store

router = APIRouter(tags=["jobs"])


@router.get("/jobs")
def list_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    jobs = task_store.list_all(limit=limit, offset=offset)
    total = task_store.count()
    return {"jobs": [j.model_dump(mode="json") for j in jobs], "total": total}


@router.post("/jobs")
def create_job(request: CreateJobRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    job_id = pipeline_service.create_job(request)
    background_tasks.add_task(pipeline_service.run_job, job_id)
    return {"job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}", response_model=JobRecord)
def get_job(job_id: str) -> JobRecord:
    pipeline_service.refresh_job(job_id)
    record = task_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")
    return record


@router.get("/jobs/{job_id}/script")
def get_job_script(job_id: str) -> dict:
    record = task_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")

    if not record.result:
        return {"job_id": job_id, "script": None, "status": record.status.value}

    manifest_path = record.result.get("output_manifest")
    script = None
    if manifest_path:
        p = Path(manifest_path)
        if p.exists():
            payload = json.loads(p.read_text(encoding="utf-8"))
            script = payload.get("script")

    return {"job_id": job_id, "script": script, "status": record.status.value}
