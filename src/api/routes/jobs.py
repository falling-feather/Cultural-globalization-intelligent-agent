from fastapi import APIRouter, BackgroundTasks, HTTPException

from src.models.schemas import CreateJobRequest, JobRecord
from src.services.pipeline import pipeline_service
from src.services.task_store import task_store

router = APIRouter(tags=["jobs"])


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
