import json
import sqlite3
from datetime import datetime
from pathlib import Path
from threading import Lock

from src.models.schemas import CreateJobRequest, JobRecord, JobStatus


class TaskStore:
    """SQLite-backed task store so job history survives process restarts."""

    def __init__(self, db_path: str = "storage/task_store.db") -> None:
        self._lock = Lock()
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT
                )
                """
            )
            conn.commit()

    def create(self, job_id: str, request: CreateJobRequest) -> JobRecord:
        now = datetime.utcnow().isoformat()
        request_json = request.model_dump_json()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO jobs (id, status, created_at, updated_at, request_json, result_json, error)
                    VALUES (?, ?, ?, ?, ?, NULL, NULL)
                    """,
                    (job_id, JobStatus.queued.value, now, now, request_json),
                )
                conn.commit()
        return self.get(job_id)  # type: ignore[return-value]

    def get(self, job_id: str) -> JobRecord | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()

        if row is None:
            return None

        request_data = json.loads(row["request_json"])
        result_data = json.loads(row["result_json"]) if row["result_json"] else None
        return JobRecord(
            id=row["id"],
            status=JobStatus(row["status"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            request=CreateJobRequest(**request_data),
            result=result_data,
            error=row["error"],
        )

    def update_status(self, job_id: str, status: JobStatus) -> None:
        now = datetime.utcnow().isoformat()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
                    (status.value, now, job_id),
                )
                conn.commit()

    def set_result(self, job_id: str, result: dict) -> None:
        now = datetime.utcnow().isoformat()
        result_json = json.dumps(result, ensure_ascii=False)
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?, updated_at = ?, result_json = ?, error = NULL
                    WHERE id = ?
                    """,
                    (JobStatus.success.value, now, result_json, job_id),
                )
                conn.commit()

    def set_running_result(self, job_id: str, result: dict) -> None:
        now = datetime.utcnow().isoformat()
        result_json = json.dumps(result, ensure_ascii=False)
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?, updated_at = ?, result_json = ?, error = NULL
                    WHERE id = ?
                    """,
                    (JobStatus.running.value, now, result_json, job_id),
                )
                conn.commit()

    def list_all(self, limit: int = 50, offset: int = 0) -> list[JobRecord]:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                ).fetchall()

        results: list[JobRecord] = []
        for row in rows:
            request_data = json.loads(row["request_json"])
            result_data = json.loads(row["result_json"]) if row["result_json"] else None
            results.append(
                JobRecord(
                    id=row["id"],
                    status=JobStatus(row["status"]),
                    created_at=datetime.fromisoformat(row["created_at"]),
                    updated_at=datetime.fromisoformat(row["updated_at"]),
                    request=CreateJobRequest(**request_data),
                    result=result_data,
                    error=row["error"],
                )
            )
        return results

    def count(self) -> int:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT COUNT(*) as cnt FROM jobs").fetchone()
        return row["cnt"] if row else 0

    def stats(self) -> dict:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT status, COUNT(*) as c FROM jobs GROUP BY status"
                ).fetchall()
                market_rows = conn.execute(
                    "SELECT json_extract(request_json,'$.market') AS market, COUNT(*) AS c "
                    "FROM jobs GROUP BY market ORDER BY c DESC LIMIT 8"
                ).fetchall()
                total_row = conn.execute("SELECT COUNT(*) AS c FROM jobs").fetchone()
        by_status = {r["status"]: int(r["c"]) for r in rows}
        by_market = [
            {"market": (r["market"] or "UNKNOWN"), "count": int(r["c"])}
            for r in market_rows
        ]
        return {
            "total": int(total_row["c"]) if total_row else 0,
            "by_status": by_status,
            "by_market": by_market,
        }

    def set_error(self, job_id: str, error: str) -> None:
        now = datetime.utcnow().isoformat()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?, updated_at = ?, error = ?
                    WHERE id = ?
                    """,
                    (JobStatus.failed.value, now, error, job_id),
                )
                conn.commit()


task_store = TaskStore()
