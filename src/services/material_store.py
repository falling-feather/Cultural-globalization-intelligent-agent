"""User-owned cultural materials store.

Stores cultural insights extracted from URLs / pasted text and binds them
to the owning user account so they can be reused as conversation context.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any

from src.core.settings import settings


@dataclass
class MaterialRecord:
    id: str
    owner_username: str
    market: str
    title: str
    source_type: str
    source_url: str
    summary_md: str
    raw_excerpt: str
    structured: dict
    created_at: str


class MaterialStore:
    def __init__(self, db_path: str | None = None) -> None:
        self._lock = Lock()
        self._db_path = Path(db_path or settings.auth_db_path)
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
                CREATE TABLE IF NOT EXISTS materials (
                    id TEXT PRIMARY KEY,
                    owner_username TEXT NOT NULL,
                    market TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_url TEXT NOT NULL DEFAULT '',
                    summary_md TEXT NOT NULL DEFAULT '',
                    raw_excerpt TEXT NOT NULL DEFAULT '',
                    structured_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_materials_owner ON materials(owner_username)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_materials_market ON materials(market)"
            )
            conn.commit()

    def _row_to_record(self, row: sqlite3.Row) -> MaterialRecord:
        try:
            structured = json.loads(row["structured_json"] or "{}")
        except Exception:
            structured = {}
        return MaterialRecord(
            id=row["id"],
            owner_username=row["owner_username"],
            market=row["market"],
            title=row["title"],
            source_type=row["source_type"],
            source_url=row["source_url"] or "",
            summary_md=row["summary_md"] or "",
            raw_excerpt=row["raw_excerpt"] or "",
            structured=structured,
            created_at=row["created_at"],
        )

    def create(
        self,
        *,
        owner_username: str,
        market: str,
        title: str,
        source_type: str,
        source_url: str,
        summary_md: str,
        raw_excerpt: str,
        structured: dict[str, Any],
    ) -> MaterialRecord:
        if not owner_username:
            raise ValueError("owner_username is required")
        title = (title or "").strip() or "未命名素材"
        market = (market or "DEFAULT").strip().upper()[:32]
        new_id = uuid.uuid4().hex[:16]
        now = datetime.utcnow().isoformat()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO materials
                (id, owner_username, market, title, source_type, source_url,
                 summary_md, raw_excerpt, structured_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    owner_username,
                    market,
                    title[:200],
                    source_type[:16],
                    (source_url or "")[:1024],
                    summary_md or "",
                    raw_excerpt or "",
                    json.dumps(structured or {}, ensure_ascii=False),
                    now,
                ),
            )
            conn.commit()
        return MaterialRecord(
            id=new_id,
            owner_username=owner_username,
            market=market,
            title=title,
            source_type=source_type,
            source_url=source_url or "",
            summary_md=summary_md or "",
            raw_excerpt=raw_excerpt or "",
            structured=structured or {},
            created_at=now,
        )

    def list_for_user(
        self,
        *,
        username: str,
        is_admin: bool = False,
        market: str | None = None,
        limit: int = 100,
    ) -> list[MaterialRecord]:
        sql = "SELECT * FROM materials"
        clauses: list[str] = []
        params: list[Any] = []
        if not is_admin:
            clauses.append("owner_username = ?")
            params.append(username)
        if market:
            clauses.append("UPPER(market) = ?")
            params.append(market.strip().upper())
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(min(max(limit, 1), 500))
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [self._row_to_record(r) for r in rows]

    def get_for_user(
        self,
        *,
        material_id: str,
        username: str,
        is_admin: bool = False,
    ) -> MaterialRecord | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM materials WHERE id = ?", (material_id,)
            ).fetchone()
        if row is None:
            return None
        if not is_admin and row["owner_username"] != username:
            return None
        return self._row_to_record(row)

    def get_many_for_user(
        self,
        *,
        material_ids: list[str],
        username: str,
        is_admin: bool = False,
    ) -> list[MaterialRecord]:
        if not material_ids:
            return []
        ids = [m for m in material_ids if isinstance(m, str)][:20]
        if not ids:
            return []
        placeholders = ",".join("?" * len(ids))
        sql = f"SELECT * FROM materials WHERE id IN ({placeholders})"
        params: list[Any] = list(ids)
        if not is_admin:
            sql += " AND owner_username = ?"
            params.append(username)
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [self._row_to_record(r) for r in rows]

    def delete_for_user(
        self,
        *,
        material_id: str,
        username: str,
        is_admin: bool = False,
    ) -> bool:
        with self._lock, self._connect() as conn:
            if is_admin:
                cur = conn.execute("DELETE FROM materials WHERE id = ?", (material_id,))
            else:
                cur = conn.execute(
                    "DELETE FROM materials WHERE id = ? AND owner_username = ?",
                    (material_id, username),
                )
            conn.commit()
            return cur.rowcount > 0


material_store = MaterialStore()
