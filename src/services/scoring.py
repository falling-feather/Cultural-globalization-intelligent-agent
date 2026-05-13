"""文化适配评分服务（V2.0 核心独创模块）。

按 5 个维度对一段拟发布文案进行 1-10 评分：
- tone        语气与目标市场偏好的契合度
- taboo       是否触及禁忌（10 分=完全没有；1 分=严重触雷）
- localization 本地化关键词与受众语境的贴合度
- credibility 文案可信度与论据支撑
- resonance   情感共鸣与文化共振度

使用 DeepSeek json_object 模式产出严格 JSON。
若 API 不可用则返回基于规则的近似分（fallback），保证前端可演示。
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from src.services.providers import ProviderError
from src.services.runtime_config import runtime_config

_SCORE_DIMS = ("tone", "taboo", "localization", "credibility", "resonance")


def _clamp(v: Any) -> float:
    try:
        f = float(v)
    except Exception:
        return 5.0
    if f < 1:
        return 1.0
    if f > 10:
        return 10.0
    return round(f, 1)


def _heuristic_score(text: str, market_rules: dict) -> dict[str, Any]:
    """LLM 不可用时基于关键词命中的快速估算分（仅做演示）。"""
    lower = text.lower()
    taboos = market_rules.get("taboo_terms") or []
    keywords = market_rules.get("cultural_keywords") or []
    festivals = market_rules.get("festival_references") or []
    tones = market_rules.get("tone_preferences") or []

    taboo_hits = sum(1 for t in taboos if t and t.lower() in lower)
    kw_hits = sum(1 for k in keywords if k and k.lower() in lower)
    fest_hits = sum(1 for f in festivals if f and f.lower() in lower)
    tone_hits = sum(1 for t in tones if t and t.lower() in lower)

    length_factor = min(len(text) / 600, 1.0)
    scores = {
        "tone": _clamp(5 + tone_hits * 1.2 + length_factor * 1.5),
        "taboo": _clamp(10 - taboo_hits * 3),
        "localization": _clamp(4 + kw_hits * 1.5 + fest_hits * 1.0),
        "credibility": _clamp(4 + length_factor * 4),
        "resonance": _clamp(4 + (kw_hits + fest_hits) * 1.0 + tone_hits * 0.5),
    }
    overall = round(sum(scores.values()) / len(scores), 1)
    return {
        "scores": scores,
        "comments": {dim: "基于关键词的近似估算（LLM 未启用）" for dim in _SCORE_DIMS},
        "overall": overall,
        "advice": ["补充本地节庆/关键词以提升 localization 与 resonance"],
        "engine": "heuristic",
    }


def _strip_json_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = re.sub(r"^json\s*", "", s, flags=re.IGNORECASE).strip()
    return s


def score_with_deepseek(text: str, market: str, market_rules: dict) -> dict[str, Any]:
    """主调用：DeepSeek json_object → 5 维评分 + 总分 + 建议。"""
    if not runtime_config.deepseek_api_key:
        return _heuristic_score(text, market_rules)

    tone_prefs = ", ".join(market_rules.get("tone_preferences", ["clear"])) or "N/A"
    taboo_terms = ", ".join(market_rules.get("taboo_terms", [])) or "N/A"
    keywords = ", ".join(market_rules.get("cultural_keywords", [])) or "N/A"
    festivals = ", ".join(market_rules.get("festival_references", [])) or "N/A"

    schema = (
        "{\n"
        "  \"scores\": {\n"
        "    \"tone\": 1-10,\n"
        "    \"taboo\": 1-10,\n"
        "    \"localization\": 1-10,\n"
        "    \"credibility\": 1-10,\n"
        "    \"resonance\": 1-10\n"
        "  },\n"
        "  \"comments\": {\n"
        "    \"tone\": \"中文短评 ≤30 字\",\n"
        "    \"taboo\": \"中文短评 ≤30 字\",\n"
        "    \"localization\": \"中文短评 ≤30 字\",\n"
        "    \"credibility\": \"中文短评 ≤30 字\",\n"
        "    \"resonance\": \"中文短评 ≤30 字\"\n"
        "  },\n"
        "  \"overall\": 1-10,\n"
        "  \"advice\": [\"3 条改进建议，每条 ≤40 字\"]\n"
        "}"
    )
    system_prompt = (
        "你是面向海外短视频内容的跨文化评估专家。"
        "你只输出严格 JSON 对象，不输出任何其它文本。"
        "评分体系：1-10 分，taboo 维度 10 分=完全无禁忌触发、1 分=严重触雷。"
    )
    user_prompt = (
        f"目标市场：{market}\n"
        f"市场偏好语气：{tone_prefs}\n"
        f"市场禁忌词：{taboo_terms}\n"
        f"本地化关键词：{keywords}\n"
        f"节庆引用：{festivals}\n\n"
        f"待评估文案（最长 4000 字）：\n{text[:4000]}\n\n"
        f"请严格输出以下 JSON：\n{schema}"
    )

    url = runtime_config.deepseek_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": runtime_config.deepseek_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {runtime_config.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=90) as client:
            resp = client.post(url, headers=headers, content=json.dumps(payload))
        if resp.status_code >= 400:
            raise ProviderError(f"DeepSeek score error: {resp.status_code} {resp.text[:200]}")
        content = _strip_json_fence(resp.json()["choices"][0]["message"]["content"])
        result = json.loads(content)
    except Exception as exc:  # noqa: BLE001
        # 失败时退回启发式，避免阻塞评分能力
        fallback = _heuristic_score(text, market_rules)
        fallback["advice"] = [f"LLM 调用失败回退启发式：{str(exc)[:60]}"] + fallback["advice"]
        return fallback

    raw_scores = result.get("scores") or {}
    scores = {dim: _clamp(raw_scores.get(dim, 5)) for dim in _SCORE_DIMS}
    raw_comments = result.get("comments") or {}
    comments = {dim: str(raw_comments.get(dim, "") or "")[:80] for dim in _SCORE_DIMS}
    overall_raw = result.get("overall")
    overall = _clamp(overall_raw) if overall_raw is not None else round(
        sum(scores.values()) / len(scores), 1
    )
    advice_raw = result.get("advice") or []
    if isinstance(advice_raw, str):
        advice_raw = [advice_raw]
    advice = [str(a)[:120] for a in advice_raw if str(a).strip()][:5]
    return {
        "scores": scores,
        "comments": comments,
        "overall": overall,
        "advice": advice,
        "engine": "deepseek",
    }
