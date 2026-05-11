import json

import httpx

from src.core.settings import settings
from src.services.runtime_config import runtime_config


class ProviderError(Exception):
    pass


def _extract_nested(data: dict, keys: list[str]) -> str | None:
    for key in keys:
        if key in data and data[key]:
            return str(data[key])
    nested = data.get("data")
    if isinstance(nested, dict):
        for key in keys:
            if key in nested and nested[key]:
                return str(nested[key])
    return None


def generate_script_with_deepseek(topic: str, market: str, tone: str, audience_tags: list[str], market_rules: dict) -> str:
    if not runtime_config.deepseek_api_key:
        raise ProviderError("DEEPSEEK_API_KEY is missing")

    url = runtime_config.deepseek_base_url.rstrip("/") + "/chat/completions"
    tone_prefs = ", ".join(market_rules.get("tone_preferences", ["clear"]))
    taboo_terms = ", ".join(market_rules.get("taboo_terms", [])) or "N/A"
    tags = ", ".join(audience_tags) or "general audience"

    system_prompt = (
        "You are a concise video script writer for overseas social media audiences. "
        "Return plain text only."
    )
    user_prompt = (
        f"Write a 60-90 second script. Topic: {topic}. Market: {market}. Tone: {tone}. "
        f"Audience tags: {tags}. Preferred style: {tone_prefs}. Avoid taboo terms: {taboo_terms}. "
        "Structure: Opening, 3 bullet insights, and Closing CTA."
    )

    payload = {
        "model": runtime_config.deepseek_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {runtime_config.deepseek_api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=60) as client:
        response = client.post(url, headers=headers, content=json.dumps(payload))

    if response.status_code >= 400:
        raise ProviderError(f"DeepSeek API error: {response.status_code} {response.text}")

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        raise ProviderError(f"DeepSeek response parse failed: {exc}") from exc


def submit_video_with_siliconflow(script: str) -> dict:
    """Optional SiliconFlow Wan submit call.

    This call is disabled unless SILICONFLOW_WAN_SUBMIT_PATH is explicitly set.
    Without that path, the pipeline returns a local placeholder URL.
    """
    if not settings.siliconflow_api_key:
        raise ProviderError("SILICONFLOW_API_KEY is missing")

    if not settings.siliconflow_wan_submit_path:
        raise ProviderError("SILICONFLOW_WAN_SUBMIT_PATH is not configured")

    url = settings.siliconflow_base_url.rstrip("/") + settings.siliconflow_wan_submit_path
    payload = {
        "model": settings.wan_model,
        "prompt": script,
        "image_size": settings.wan_image_size,
    }
    if settings.wan_image:
        payload["image"] = settings.wan_image
    headers = {
        "Authorization": f"Bearer {settings.siliconflow_api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=60) as client:
        response = client.post(url, headers=headers, content=json.dumps(payload))

    if response.status_code >= 400:
        raise ProviderError(f"SiliconFlow API error: {response.status_code} {response.text}")

    data = response.json()
    task_id = _extract_nested(data, ["requestId", "request_id", "task_id", "id"])
    video_url = _extract_nested(data, ["video_url", "url", "output_url"])
    return {
        "raw": data,
        "task_id": task_id,
        "video_url": video_url,
    }


def query_video_with_siliconflow(task_id: str) -> dict:
    if not settings.siliconflow_api_key:
        raise ProviderError("SILICONFLOW_API_KEY is missing")

    if not settings.siliconflow_wan_query_path:
        raise ProviderError("SILICONFLOW_WAN_QUERY_PATH is not configured")

    url = settings.siliconflow_base_url.rstrip("/") + settings.siliconflow_wan_query_path
    headers = {
        "Authorization": f"Bearer {settings.siliconflow_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"requestId": task_id}

    with httpx.Client(timeout=60) as client:
        response = client.post(url, headers=headers, content=json.dumps(payload))

    if response.status_code >= 400:
        raise ProviderError(f"SiliconFlow query error: {response.status_code} {response.text}")

    data = response.json()
    status = (_extract_nested(data, ["status", "state"]) or "unknown").lower()
    video_url = _extract_nested(data, ["video_url", "url", "output_url"])
    results = data.get("results")
    if not video_url and isinstance(results, dict):
        videos = results.get("videos")
        if isinstance(videos, list) and videos:
            first = videos[0]
            if isinstance(first, dict) and first.get("url"):
                video_url = str(first["url"])
    error_message = _extract_nested(data, ["error", "message", "reason"])
    return {
        "raw": data,
        "status": status,
        "video_url": video_url,
        "error_message": error_message,
    }


def summarize_content_for_market(text: str, market: str, market_rules: dict) -> str:
    """Analyze pasted or fetched text for cross-cultural communication / video adaptation."""
    if not runtime_config.deepseek_api_key:
        raise ProviderError("DEEPSEEK_API_KEY is missing")

    tone_prefs = ", ".join(market_rules.get("tone_preferences", ["clear"]))
    taboo_terms = ", ".join(market_rules.get("taboo_terms", [])) or "N/A"
    language = market_rules.get("language", "en")

    system_prompt = (
        "You are a senior cross-cultural communications analyst for overseas short-video and social content. "
        "Output clear Markdown with headings. Be concrete and actionable."
    )
    user_prompt = (
        f"Target market: {market}. Preferred tones for this market: {tone_prefs}. "
        f"Avoid or flag these taboo/sensitive terms: {taboo_terms}. "
        f"Primary audience language context: {language}.\n\n"
        "Below is source content (article/page excerpt). Analyze it and produce:\n"
        "## 1. 内容摘要（3–6 句）\n"
        "## 2. 当前文化风格与语气（正式/口语、价值倾向、叙事方式）\n"
        "## 3. 若面向该目标市场传播的风险点与禁忌提醒\n"
        "## 4. 适配建议（标题角度、口播切入点、可删改点）\n"
        "## 5. 若做成 60–90 秒短视频的 3 条一句话 hook 建议（可用中文或中英混合，按内容定）\n\n"
        "---\n"
        f"{text}"
    )

    url = runtime_config.deepseek_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": runtime_config.deepseek_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.5,
    }
    headers = {
        "Authorization": f"Bearer {runtime_config.deepseek_api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=120) as client:
        response = client.post(url, headers=headers, content=json.dumps(payload))

    if response.status_code >= 400:
        raise ProviderError(f"DeepSeek API error: {response.status_code} {response.text}")

    data = response.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        raise ProviderError(f"DeepSeek response parse failed: {exc}") from exc


def extract_structured_material(
    *,
    summary_md: str,
    raw_text: str,
    market: str,
    market_rules: dict,
    source_url: str = "",
) -> dict:
    """Step-2 of insight pipeline: turn the markdown report into a normalized
    structured material record (title / tone_observed / risks / taboo_hits / tags / key_quotes).
    """
    if not runtime_config.deepseek_api_key:
        raise ProviderError("DEEPSEEK_API_KEY is missing")

    taboo_terms = market_rules.get("taboo_terms", []) or []
    tone_prefs = market_rules.get("tone_preferences", []) or []
    schema_hint = (
        "{\n"
        "  \"title\": \"短标题，<=30字，反映素材主题\",\n"
        "  \"tone_observed\": [\"原文呈现出来的语气\"],\n"
        "  \"risks\": [\"对目标市场的传播风险点\"],\n"
        "  \"taboo_hits\": [\"原文中触及/接近 taboo 的词或表达\"],\n"
        "  \"tags\": [\"3-6个领域/题材标签\"],\n"
        "  \"key_quotes\": [\"2-4 句最具代表性的原文摘录，<=80字/句\"]\n"
        "}"
    )
    system_prompt = (
        "You convert a cross-cultural analysis report into a strict JSON object. "
        "Return ONLY a JSON object, no prose, no code fence. All string lists must be unique and concise."
    )
    user_prompt = (
        f"Target market: {market}. Market preferred tones: {', '.join(tone_prefs) or 'N/A'}. "
        f"Market taboo list: {', '.join(taboo_terms) or 'N/A'}. Source url: {source_url or 'N/A'}.\n\n"
        "Markdown analysis:\n"
        f"{summary_md[:4000]}\n\n"
        "Raw text excerpt (truncated):\n"
        f"{raw_text[:4000]}\n\n"
        f"Output strictly this JSON shape (Chinese values are fine):\n{schema_hint}"
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
    with httpx.Client(timeout=120) as client:
        response = client.post(url, headers=headers, content=json.dumps(payload))
    if response.status_code >= 400:
        raise ProviderError(
            f"DeepSeek extract error: {response.status_code} {response.text[:200]}"
        )
    try:
        content = response.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(f"DeepSeek extract parse failed: {exc}") from exc
    if content.startswith("```"):
        content = content.strip("`").lstrip("json").strip()
    try:
        result = json.loads(content)
    except Exception as exc:  # noqa: BLE001
        raise ProviderError(f"DeepSeek extract returned non-JSON: {exc}") from exc

    def _str_list(v: object, max_items: int = 8, max_len: int = 200) -> list[str]:
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
            return [v.strip()[:max_len]] if v.strip() else []
        return []

    title = str(result.get("title") or "").strip() or "未命名素材"
    return {
        "title": title[:80],
        "tone_observed": _str_list(result.get("tone_observed"), 6, 60),
        "risks": _str_list(result.get("risks"), 8, 200),
        "taboo_hits": _str_list(result.get("taboo_hits"), 8, 80),
        "tags": _str_list(result.get("tags"), 8, 40),
        "key_quotes": _str_list(result.get("key_quotes"), 5, 200),
    }
