import json
from pathlib import Path
from uuid import uuid4

from src.core.settings import settings
from src.models.schemas import CreateJobRequest, JobStatus
from src.services.culture import culture_service
from src.services.providers import (
    ProviderError,
    generate_script_with_deepseek,
    query_video_with_siliconflow,
    submit_video_with_siliconflow,
)
from src.services.task_store import task_store


class PipelineService:
    def __init__(self) -> None:
        self.output_dir = Path(settings.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def create_job(self, request: CreateJobRequest) -> str:
        job_id = str(uuid4())
        task_store.create(job_id, request)
        return job_id

    def run_job(self, job_id: str) -> None:
        record = task_store.get(job_id)
        if record is None:
            return

        try:
            task_store.update_status(job_id, JobStatus.running)

            market_rules = culture_service.get_market_rules(record.request.market)
            provider_notes: list[str] = []

            if settings.use_real_apis:
                try:
                    script = generate_script_with_deepseek(
                        topic=record.request.topic,
                        market=record.request.market,
                        tone=record.request.tone,
                        audience_tags=record.request.audience_tags,
                        market_rules=market_rules,
                    )
                    provider_notes.append("deepseek:real")
                except ProviderError as exc:
                    raise ProviderError(f"DeepSeek generation failed: {exc}") from exc
            else:
                script = self._build_script(record.request, market_rules)
                provider_notes.append("deepseek:mock")

            video_url = ""
            remote_task_id: str | None = None
            if settings.use_real_apis:
                try:
                    video_resp = submit_video_with_siliconflow(script)
                    remote_task_id = video_resp.get("task_id")
                    direct_video_url = video_resp.get("video_url")
                    if direct_video_url:
                        video_url = direct_video_url
                        provider_notes.append("siliconflow:real_immediate")
                    elif remote_task_id:
                        provider_notes.append("siliconflow:submitted")
                    else:
                        raise ProviderError("SiliconFlow submit succeeded but no requestId/video_url in response")
                except ProviderError as exc:
                    raise ProviderError(f"SiliconFlow submit failed: {exc}") from exc
            else:
                provider_notes.append("siliconflow:mock_disabled")
                video_url = f"local://{job_id}.mp4"

            # MVP阶段先输出“模拟产物”，后续接真实API替换这里
            output_payload = {
                "job_id": job_id,
                "market": record.request.market,
                "topic": record.request.topic,
                "audience_tags": record.request.audience_tags,
                "tone": record.request.tone,
                "model_config": {
                    "text_provider": "deepseek",
                    "text_model": settings.deepseek_model,
                    "video_provider": "siliconflow",
                    "video_model": settings.wan_model,
                    "video_task_type": settings.wan_task_type,
                },
                "provider_notes": provider_notes,
                "remote_task_id": remote_task_id,
                "culture_rules_used": market_rules,
                "script": script,
                "voice_file": f"{job_id}.mp3",
                "video_file": f"{job_id}.mp4",
                "subtitle_file": f"{job_id}.srt",
            }

            output_path = self.output_dir / f"{job_id}.json"
            output_path.write_text(
                json.dumps(output_payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            output_manifest = str(output_path).replace("\\", "/")
            if video_url:
                task_store.set_result(
                    job_id,
                    {
                        "output_manifest": output_manifest,
                        "video_url": video_url,
                        "remote_task_id": remote_task_id,
                    },
                )
            elif remote_task_id:
                task_store.set_running_result(
                    job_id,
                    {
                        "output_manifest": output_manifest,
                        "video_url": None,
                        "remote_task_id": remote_task_id,
                    },
                )
            else:
                raise ProviderError("No video URL or requestId available after submit")
        except Exception as exc:
            task_store.set_error(job_id, str(exc))

    def refresh_job(self, job_id: str) -> None:
        record = task_store.get(job_id)
        if record is None or record.status != JobStatus.running or not record.result:
            return

        remote_task_id = record.result.get("remote_task_id")
        output_manifest = record.result.get("output_manifest")
        if not remote_task_id or not output_manifest:
            return

        try:
            query_resp = query_video_with_siliconflow(remote_task_id)
            status = query_resp.get("status", "unknown")
            video_url = query_resp.get("video_url")

            manifest_path = Path(output_manifest)
            if manifest_path.exists():
                payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            else:
                payload = {"job_id": job_id, "provider_notes": []}

            notes = payload.get("provider_notes", [])
            if isinstance(notes, list):
                notes.append(f"siliconflow:poll_status={status}")
            else:
                notes = [f"siliconflow:poll_status={status}"]
            payload["provider_notes"] = notes

            if video_url:
                payload["video_url"] = video_url
                manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                task_store.set_result(
                    job_id,
                    {
                        "output_manifest": output_manifest,
                        "video_url": video_url,
                        "remote_task_id": remote_task_id,
                    },
                )
                return

            if status in {"failed", "error", "canceled"}:
                message = query_resp.get("error_message") or "unknown provider error"
                manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                task_store.set_error(job_id, f"SiliconFlow task failed: {message}")
                return

            manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            task_store.set_running_result(
                job_id,
                {
                    "output_manifest": output_manifest,
                    "video_url": None,
                    "remote_task_id": remote_task_id,
                },
            )
        except Exception as exc:
            task_store.set_error(job_id, f"SiliconFlow status check failed: {exc}")

    def _build_script(self, request: CreateJobRequest, market_rules: dict) -> str:
        tone_prefs = ", ".join(market_rules.get("tone_preferences", ["clear"]))
        taboo_terms = ", ".join(market_rules.get("taboo_terms", [])) or "N/A"
        tags = ", ".join(request.audience_tags) or "general audience"

        return (
            f"Opening: Today we talk about {request.topic} for {request.market} audience.\n"
            f"Audience tags: {tags}. Preferred style: {tone_prefs}.\n"
            f"Tone requested: {request.tone}. Avoid taboo terms: {taboo_terms}.\n"
            "Body: Present 3 practical insights with concise examples and local context.\n"
            "Closing: Give a clear call-to-action in one sentence."
        )


pipeline_service = PipelineService()
