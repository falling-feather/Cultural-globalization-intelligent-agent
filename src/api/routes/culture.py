from typing import Annotated

from fastapi import APIRouter, Depends

from src.api.deps import CurrentUser, get_current_user
from src.services.culture import culture_service

router = APIRouter(tags=["culture"])


@router.get("/culture")
def list_markets(_user: Annotated[CurrentUser, Depends(get_current_user)]) -> list[dict]:
    return culture_service.list_markets()


@router.get("/culture/{market}")
def get_market_rules(
    _user: Annotated[CurrentUser, Depends(get_current_user)],
    market: str,
) -> dict:
    return culture_service.get_market_rules(market)
