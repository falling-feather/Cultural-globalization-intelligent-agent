from fastapi import APIRouter

from src.services.culture import culture_service

router = APIRouter(tags=["culture"])


@router.get("/culture")
def list_markets() -> list[dict]:
    return culture_service.list_markets()


@router.get("/culture/{market}")
def get_market_rules(market: str) -> dict:
    return culture_service.get_market_rules(market)
