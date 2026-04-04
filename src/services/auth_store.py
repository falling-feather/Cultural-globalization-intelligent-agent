import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock

from src.core.security import hash_password
from src.core.settings import settings


@dataclass
class UserRecord:
    id: int
    username: str
    password_hash: str
    role: str


class AuthStore:
    def __init__(self, db_path: str | None = None) -> None:
        self._lock = Lock()
        self._db_path = Path(db_path or settings.auth_db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._bootstrap_admin_if_needed()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    username TEXT NOT NULL,
                    client_ip TEXT NOT NULL,
                    action TEXT NOT NULL,
                    detail TEXT
                )
                """
            )
            conn.commit()

    def _bootstrap_admin_if_needed(self) -> None:
        user = settings.admin_username.strip()
        pwd = settings.admin_password
        if not user or not pwd:
            return
        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()
                if row and row["c"] > 0:
                    return
                now = datetime.utcnow().isoformat()
                conn.execute(
                    """
                    INSERT INTO users (username, password_hash, role, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (user, hash_password(pwd), "admin", now),
                )
                conn.commit()

    def get_user_by_username(self, username: str) -> UserRecord | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT id, username, password_hash, role FROM users WHERE username = ?",
                    (username,),
                ).fetchone()
        if row is None:
            return None
        return UserRecord(
            id=row["id"],
            username=row["username"],
            password_hash=row["password_hash"],
            role=row["role"],
        )

    def add_audit(
        self,
        *,
        username: str,
        client_ip: str,
        action: str,
        detail: dict | None = None,
    ) -> None:
        now = datetime.utcnow().isoformat()
        detail_json = json.dumps(detail, ensure_ascii=False) if detail else None
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO audit_logs (created_at, username, client_ip, action, detail)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (now, username, client_ip, action, detail_json),
                )
                conn.commit()

    def list_audit_logs(self, *, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        with self._lock:
            with self._connect() as conn:
                total = conn.execute("SELECT COUNT(*) AS c FROM audit_logs").fetchone()["c"]
                rows = conn.execute(
                    """
                    SELECT id, created_at, username, client_ip, action, detail
                    FROM audit_logs
                    ORDER BY id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                ).fetchall()
        items = []
        for r in rows:
            items.append(
                {
                    "id": r["id"],
                    "created_at": r["created_at"],
                    "username": r["username"],
                    "client_ip": r["client_ip"],
                    "action": r["action"],
                    "detail": r["detail"],
                }
            )
        return items, total


auth_store = AuthStore()
