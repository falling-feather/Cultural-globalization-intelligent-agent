import json
from pathlib import Path


class CultureService:
    def __init__(self, base_dir: str = "data/culture") -> None:
        self.base_dir = Path(base_dir)

    def get_market_rules(self, market: str) -> dict:
        market_file = self.base_dir / f"{market.lower()}.json"
        if market_file.exists():
            return json.loads(market_file.read_text(encoding="utf-8"))

        fallback_file = self.base_dir / "default.json"
        if fallback_file.exists():
            return json.loads(fallback_file.read_text(encoding="utf-8"))

        return {
            "language": "en",
            "tone_preferences": ["clear", "friendly"],
            "taboo_terms": [],
        }


culture_service = CultureService()
