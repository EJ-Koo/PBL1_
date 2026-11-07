"""코인 · 상점 · 보유 아이템 (2026-11-07).

코인 계산(구매, 지급)은 DB 함수(migrations/2026-11-07_shop_coins.sql)가 한 번에 처리한다.
여기서는 그 함수를 부르고, 실패 메시지를 HTTP 오류로 바꾸기만 한다.
"""

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.shop import EquipRequest, PurchaseRequest, PurchaseResult, ShopItem, Wallet

router = APIRouter(tags=["shop"])

# DB 함수가 raise 하는 메시지 → (상태 코드, 화면에 보여줄 문장)
_DB_ERRORS = {
    "item_not_found": (404, "판매 중인 아이템이 아닙니다."),
    "already_owned": (409, "이미 가지고 있는 아이템입니다."),
    "not_enough_coins": (400, "코인이 부족합니다."),
    "not_owned": (404, "가지고 있는 장착 아이템이 아닙니다."),
}

_MISSING_TABLE_HINT = (
    "상점 표가 아직 없습니다. Supabase SQL Editor에서 "
    "migrations/2026-11-07_shop_coins.sql 을 실행해 주세요."
)


def call_db_function(name: str, params: dict):
    """DB 함수를 부르고, 알려진 실패는 HTTPException 으로 바꾼다."""
    try:
        return supabase.rpc(name, params).execute().data
    except APIError as e:
        message = e.message or ""
        for key, (status, detail) in _DB_ERRORS.items():
            if key in message:
                raise HTTPException(status_code=status, detail=detail)
        # 함수가 없다 = 마이그레이션을 아직 안 돌림 (PGRST202 / 42883)
        if e.code in ("PGRST202", "42883") or "Could not find the function" in message:
            raise HTTPException(status_code=503, detail=_MISSING_TABLE_HINT)
        raise


def ensure_wallet(user_id: str) -> int:
    return int(call_db_function("ensure_wallet", {"p_user": user_id}))


@router.get("/me/wallet", response_model=Wallet)
def get_wallet(user_id: str = Depends(get_current_user_id)):
    return Wallet(coins=ensure_wallet(user_id))


@router.get("/shop/items", response_model=list[ShopItem])
def list_shop_items(user_id: str = Depends(get_current_user_id)):
    """판매 중인 아이템 + (판매가 끝났어도) 내가 가진 아이템."""
    try:
        items = supabase.table("items").select("*").order("sort_order").execute().data
        owned = supabase.table("user_items").select("*").eq("user_id", user_id).execute().data
    except APIError as e:
        if e.code in ("PGRST205", "42P01"):
            raise HTTPException(status_code=503, detail=_MISSING_TABLE_HINT)
        raise

    owned_by_id = {o["item_id"]: o for o in owned}
    result = []
    for item in items:
        mine = owned_by_id.get(item["id"])
        quantity = mine["quantity"] if mine else 0
        if not item["is_active"] and quantity == 0:
            continue
        result.append(
            ShopItem(
                id=item["id"],
                name=item["name"],
                icon=item["icon"],
                description=item["description"],
                price=item["price"],
                kind=item["kind"],
                slot=item.get("slot"),
                effect=item.get("effect") or {},
                on_sale=item["is_active"],
                quantity=quantity,
                equipped=bool(mine and mine["equipped"] and quantity > 0),
            )
        )
    return result


@router.post("/shop/purchase", response_model=PurchaseResult)
def purchase(payload: PurchaseRequest, user_id: str = Depends(get_current_user_id)):
    data = call_db_function("purchase_item", {"p_user": user_id, "p_item": payload.item_id})
    return PurchaseResult(**data)


@router.post("/me/items/{item_id}/equip", status_code=204)
def set_equipped(item_id: str, payload: EquipRequest, user_id: str = Depends(get_current_user_id)):
    call_db_function("equip_item", {"p_user": user_id, "p_item": item_id, "p_on": payload.equipped})
