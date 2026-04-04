from pathlib import Path

from slowapi import Limiter
from starlette.requests import Request

from src.core.settings import settings

# slowapi reads this file with system default encoding; keep ASCII-only so Windows GBK is safe.
_RATELIMIT_ENV = Path(__file__).resolve().parent / "ratelimit.env"


def rate_limit_key(request: Request) -> str:
    if settings.trust_proxy_headers:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


limiter = Limiter(key_func=rate_limit_key, config_filename=str(_RATELIMIT_ENV))
