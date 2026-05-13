"""文化规则加载与查询服务。

V2.0 新增字段（向后兼容旧 JSON）：
- cultural_keywords: list[str] —— 高效共鸣的本地化关键词
- festival_references: list[str] —— 节庆与赛事引用
- audience_notes: list[str] —— 受众备注（不直接拼进 LLM Prompt，仅用于前端展示）
"""

import json
from pathlib import Path
from typing import Any


def _normalize_rules(data: dict[str, Any]) -> dict[str, Any]:
    """补齐缺失字段，统一类型，避免后续模块判空。"""
    return {
        "language": str(data.get("language") or "en"),
        "tone_preferences": list(data.get("tone_preferences") or ["clear"]),
        "taboo_terms": list(data.get("taboo_terms") or []),
        "cultural_keywords": list(data.get("cultural_keywords") or []),
        "festival_references": list(data.get("festival_references") or []),
        "audience_notes": list(data.get("audience_notes") or []),
    }


class CultureService:
    def __init__(self, base_dir: str = "data/culture") -> None:
        self.base_dir = Path(base_dir)

    def get_market_rules(self, market: str) -> dict:
        market_file = self.base_dir / f"{market.lower()}.json"
        if market_file.exists():
            return _normalize_rules(json.loads(market_file.read_text(encoding="utf-8")))

        fallback_file = self.base_dir / "default.json"
        if fallback_file.exists():
            return _normalize_rules(json.loads(fallback_file.read_text(encoding="utf-8")))

        return _normalize_rules({})

    def list_markets(self) -> list[dict]:
        markets: list[dict] = []
        if not self.base_dir.exists():
            return markets
        for f in sorted(self.base_dir.glob("*.json")):
            name = f.stem
            data = json.loads(f.read_text(encoding="utf-8"))
            markets.append(
                {
                    "id": name,
                    "language": data.get("language", "en"),
                    "label": name.upper(),
                    "has_keywords": bool(data.get("cultural_keywords")),
                    "has_festivals": bool(data.get("festival_references")),
                }
            )
        return markets


culture_service = CultureService()
