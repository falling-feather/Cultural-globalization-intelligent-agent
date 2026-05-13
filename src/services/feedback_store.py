"""AI 反馈闭环存储（V2.0）。

记录用户对 AI 回复的「有用 / 无用」打分，用于：
- admin 端按市场维度查看满意度趋势
- 后续模型微调或 prompt 调整的真实数据来源
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any

from src.core.settings import settings


@dataclass
class FeedbackRecord:
    id: int
    username: str
    market: str
    source: str  # chat / score / job
    rating: int  # +1 = 有用, -1 = 无用
    comment: str
    message_excerpt: str
    created_at: str


class FeedbackStore:
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
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    market TEXT NOT NULL,
                    source TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    comment TEXT NOT NULL DEFAULT '',
                    message_excerpt TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_feedback_market ON feedback(market)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS ix_feedback_user ON feedback(username)"
            )
            conn.commit()

    def add(
        self,
        *,
        username: str,
        market: str,
        source: str,
        rating: int,
        comment: str = "",
        message_excerpt: str = "",
    ) -> FeedbackRecord:
        if rating not in (-1, 1):
            raise ValueError("rating must be -1 or 1")
        if source not in ("chat", "score", "job"):
            raise ValueError("invalid source")
        market = (market or "DEFAULT").strip().upper()[:32]
        comment = (comment or "")[:500]
        message_excerpt = (message_excerpt or "")[:500]
        now = datetime.utcnow().isoformat()
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO feedback (username, market, source, rating, comment, message_excerpt, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (username, market, source, int(rating), comment, message_excerpt, now),
            )
            conn.commit()
            new_id = cur.lastrowid or 0
        return FeedbackRecord(
            id=new_id,
            username=username,
            market=market,
            source=source,
            rating=int(rating),
            comment=comment,
            message_excerpt=message_excerpt,
            created_at=now,
        )

    def list_recent(self, *, limit: int = 50) -> list[dict[str, Any]]:
        limit = min(max(limit, 1), 200)
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, username, market, source, rating, comment, message_excerpt, created_at "
                "FROM feedback ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def stats(self) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            total_row = conn.execute("SELECT COUNT(*) AS c FROM feedback").fetchone()
            pos_row = conn.execute(
                "SELECT COUNT(*) AS c FROM feedback WHERE rating = 1"
            ).fetchone()
            neg_row = conn.execute(
                "SELECT COUNT(*) AS c FROM feedback WHERE rating = -1"
            ).fetchone()
            market_rows = conn.execute(
                """
                SELECT market,
                       SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS positive,
                       SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) AS negative,
                       COUNT(*) AS total
                FROM feedback
                GROUP BY market
                ORDER BY total DESC
                """
            ).fetchall()
            source_rows = conn.execute(
                "SELECT source, COUNT(*) AS c FROM feedback GROUP BY source"
            ).fetchall()
        total = int(total_row["c"]) if total_row else 0
        positive = int(pos_row["c"]) if pos_row else 0
        negative = int(neg_row["c"]) if neg_row else 0
        satisfaction = round(positive / total * 100, 1) if total else 0.0
        by_market = []
        for r in market_rows:
            t = int(r["total"]) or 0
            p = int(r["positive"] or 0)
            n = int(r["negative"] or 0)
            sat = round(p / t * 100, 1) if t else 0.0
            by_market.append(
                {"market": r["market"], "positive": p, "negative": n, "total": t, "satisfaction": sat}
            )
        by_source = {r["source"]: int(r["c"]) for r in source_rows}
        return {
            "total": total,
            "positive": positive,
            "negative": negative,
            "satisfaction": satisfaction,
            "by_market": by_market,
            "by_source": by_source,
        }


feedback_store = FeedbackStore()
