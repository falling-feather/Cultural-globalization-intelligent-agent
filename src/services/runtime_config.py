"""运行时可修改的模型配置（API Key / Base URL / Model）。

设计目标：
- 默认从 settings(.env) 读取
- 管理员通过 /api/v1/admin/model-config 更新后，写入 storage/model_config.json
- 启动时若该文件存在则覆盖默认值
- providers.py / chat.py 调用 runtime_config 而不是直接 settings.deepseek_*

只覆盖 DeepSeek 文本模型；视频模型（硅基流动 Wan）仍使用 settings。
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

from src.core.settings import settings


class RuntimeConfig:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._path = Path(settings.output_dir).parent / "model_config.json"
        self._data: dict[str, str] = {
            "deepseek_api_key": settings.deepseek_api_key or "",
            "deepseek_base_url": settings.deepseek_base_url or "https://api.deepseek.com/v1",
            "deepseek_model": settings.deepseek_model or "deepseek-chat",
        }
        self._load()

    def _load(self) -> None:
        try:
            if self._path.exists():
                raw = json.loads(self._path.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    for k in ("deepseek_api_key", "deepseek_base_url", "deepseek_model"):
                        v = raw.get(k)
                        if isinstance(v, str) and v.strip():
                            self._data[k] = v.strip()
        except Exception:
            # 文件损坏不影响启动
            pass

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @property
    def deepseek_api_key(self) -> str:
        return self._data.get("deepseek_api_key", "")

    @property
    def deepseek_base_url(self) -> str:
        return self._data.get("deepseek_base_url", "https://api.deepseek.com/v1")

    @property
    def deepseek_model(self) -> str:
        return self._data.get("deepseek_model", "deepseek-chat")

    def snapshot(self, mask_key: bool = True) -> dict[str, str]:
        key = self._data.get("deepseek_api_key", "")
        if mask_key and key:
            masked = key[:6] + "…" + key[-4:] if len(key) > 12 else "***"
        else:
            masked = key
        return {
            "deepseek_api_key": masked,
            "deepseek_api_key_set": bool(key),
            "deepseek_base_url": self.deepseek_base_url,
            "deepseek_model": self.deepseek_model,
        }

    def update(
        self,
        deepseek_api_key: str | None = None,
        deepseek_base_url: str | None = None,
        deepseek_model: str | None = None,
    ) -> dict[str, str]:
        with self._lock:
            if deepseek_api_key is not None:
                v = deepseek_api_key.strip()
                if v and not v.startswith("sk-"):
                    raise ValueError("API Key 通常以 sk- 开头")
                if v:
                    self._data["deepseek_api_key"] = v
            if deepseek_base_url is not None:
                v = deepseek_base_url.strip().rstrip("/")
                if v and not (v.startswith("http://") or v.startswith("https://")):
                    raise ValueError("Base URL 必须以 http:// 或 https:// 开头")
                if v:
                    self._data["deepseek_base_url"] = v
            if deepseek_model is not None:
                v = deepseek_model.strip()
                if v:
                    self._data["deepseek_model"] = v
            self._save()
        return self.snapshot()


runtime_config = RuntimeConfig()
