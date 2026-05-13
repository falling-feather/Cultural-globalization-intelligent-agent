"""品牌音调库（Brand Voice）存储 —— V2.0 核心独创模块。

每个用户可创建多个「品牌规则包」，每个规则包包含：
- name              规则包名称（用户可读）
- keywords          推荐关键词（list[str]）
- banned_words      禁用词（list[str]）
- style_notes       风格说明（多行字符串，自由格式）

在对话和任务创建时可选附加 brand_voice_id，与文化规则形成「双引擎注入」。
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
class BrandVoiceRecord:
    id: str
    owner_username: str
    name: str
    keywords: list[str]
    banned_words: list[str]
    style_notes: str
    created_at: str
    updated_at: str


def _str_list(v: Any, max_items: int = 30, max_len: int = 60) -> list[str]:
    if isinstance(v, list):
        out: list[str] = []
        seen: set[str] = set()
        for item in v:
            s = str(item).strip()[:max_len]
            if s and s not in seen:
                out.append(s)
                seen.add(s)
            if len(out) >= max_items:
                break
        return out
    if isinstance(v, str):
        # 兼容前端用换行/逗号分隔的输入
        parts = [p.strip()[:max_len] for p in v.replace("，", ",").replace("\n", ",").split(",")]
        return [p for p in parts if p][:max_items]
    return []


class BrandVoiceStore:
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
                CREATE TABLE IF NOT EXISTS brand_voices (
                    id TEXT PRIMARY KEY,
                    owner_username TEXT NOT NULL,
                    name TEXT NOT NULL,
                    keywords_json TEXT NOT NULL DEFAULT '[]',
                    banned_words_json TEXT NOT NULL DEFAULT '[]',
                    style_notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_brand_voices_owner ON brand_voices(owner_username)"
            )
            conn.commit()

    def _row_to_record(self, row: sqlite3.Row) -> BrandVoiceRecord:
        try:
            keywords = json.loads(row["keywords_json"] or "[]")
        except Exception:
            keywords = []
        try:
            banned = json.loads(row["banned_words_json"] or "[]")
        except Exception:
            banned = []
        return BrandVoiceRecord(
            id=row["id"],
            owner_username=row["owner_username"],
            name=row["name"],
            keywords=keywords,
            banned_words=banned,
            style_notes=row["style_notes"] or "",
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create(
        self,
        *,
        owner_username: str,
        name: str,
        keywords: Any = None,
        banned_words: Any = None,
        style_notes: str = "",
    ) -> BrandVoiceRecord:
        if not owner_username:
            raise ValueError("owner_username is required")
        name = (name or "").strip()
        if not name:
            raise ValueError("name is required")
        new_id = uuid.uuid4().hex[:16]
        now = datetime.utcnow().isoformat()
        kw = _str_list(keywords)
        bw = _str_list(banned_words)
        notes = (style_notes or "").strip()[:2000]
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brand_voices
                (id, owner_username, name, keywords_json, banned_words_json, style_notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    owner_username,
                    name[:80],
                    json.dumps(kw, ensure_ascii=False),
                    json.dumps(bw, ensure_ascii=False),
                    notes,
                    now,
                    now,
                ),
            )
            conn.commit()
        return BrandVoiceRecord(
            id=new_id,
            owner_username=owner_username,
            name=name[:80],
            keywords=kw,
            banned_words=bw,
            style_notes=notes,
            created_at=now,
            updated_at=now,
        )

    def list_for_user(
        self, *, username: str, is_admin: bool = False, limit: int = 100
    ) -> list[BrandVoiceRecord]:
        sql = "SELECT * FROM brand_voices"
        params: list[Any] = []
        if not is_admin:
            sql += " WHERE owner_username = ?"
            params.append(username)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(min(max(limit, 1), 500))
        with self._lock, self._connect() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [self._row_to_record(r) for r in rows]

    def get_for_user(
        self, *, voice_id: str, username: str, is_admin: bool = False
    ) -> BrandVoiceRecord | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM brand_voices WHERE id = ?", (voice_id,)
            ).fetchone()
        if row is None:
            return None
        if not is_admin and row["owner_username"] != username:
            return None
        return self._row_to_record(row)

    def update(
        self,
        *,
        voice_id: str,
        username: str,
        is_admin: bool = False,
        name: str | None = None,
        keywords: Any = None,
        banned_words: Any = None,
        style_notes: str | None = None,
    ) -> BrandVoiceRecord | None:
        rec = self.get_for_user(voice_id=voice_id, username=username, is_admin=is_admin)
        if rec is None:
            return None
        new_name = (name.strip()[:80] if isinstance(name, str) and name.strip() else rec.name)
        new_kw = _str_list(keywords) if keywords is not None else rec.keywords
        new_bw = _str_list(banned_words) if banned_words is not None else rec.banned_words
        new_notes = (style_notes.strip()[:2000] if isinstance(style_notes, str) else rec.style_notes)
        now = datetime.utcnow().isoformat()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE brand_voices
                SET name = ?, keywords_json = ?, banned_words_json = ?, style_notes = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    new_name,
                    json.dumps(new_kw, ensure_ascii=False),
                    json.dumps(new_bw, ensure_ascii=False),
                    new_notes,
                    now,
                    voice_id,
                ),
            )
            conn.commit()
        return BrandVoiceRecord(
            id=voice_id,
            owner_username=rec.owner_username,
            name=new_name,
            keywords=new_kw,
            banned_words=new_bw,
            style_notes=new_notes,
            created_at=rec.created_at,
            updated_at=now,
        )

    def delete_for_user(
        self, *, voice_id: str, username: str, is_admin: bool = False
    ) -> bool:
        with self._lock, self._connect() as conn:
            if is_admin:
                cur = conn.execute("DELETE FROM brand_voices WHERE id = ?", (voice_id,))
            else:
                cur = conn.execute(
                    "DELETE FROM brand_voices WHERE id = ? AND owner_username = ?",
                    (voice_id, username),
                )
            conn.commit()
            return cur.rowcount > 0


def render_brand_voice_block(rec: BrandVoiceRecord) -> str:
    """把品牌规则包渲染成可拼到 system prompt 的文本块。"""
    lines = [
        "",
        f"=== Brand voice rule pack: {rec.name} (must follow strictly) ===",
    ]
    if rec.keywords:
        lines.append("Preferred brand keywords: " + ", ".join(rec.keywords))
    if rec.banned_words:
        lines.append("Banned words (do not use): " + ", ".join(rec.banned_words))
    if rec.style_notes:
        lines.append("Style notes:")
        lines.append(rec.style_notes)
    lines.append("")
    return "\n".join(lines)


brand_voice_store = BrandVoiceStore()
