"""코인 · 상점 · 보유 아이템 (2026-11-07).

코인 계산(구매, 지급)은 DB 함수(migrations/2026-11-07_shop_coins.sql)가 한 번에 처리한다.
여기서는 그 함수를 부르고, 실패 메시지를 HTTP 오류로 바꾸기만 한다.

[ADDED 2026-11-12] 행성 특수 효과(migrations/2026-11-12_planet_effects.sql)
  - 효과 아이템 = 소모품 종류 + 칸 planet_effect. 1개 = 행성 1개. 여러 행성에 쓰려면 그 수만큼 산다.
  - 적용·변경·해제는 DB 함수 apply_planet_effect 가 일기 주인·남은 개수를 확인하고 한 번에 처리한다.
    해제하거나 다른 효과로 바꾸면 그 1개는 다시 남은 개수로 돌아온다.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.db import supabase
from app.dependencies import get_current_user_id
from app.schemas.shop import (
    EquipRequest,
    PlanetEffectRequest,
    PlanetEffectResult,
    PurchaseRequest,
    PurchaseResult,
    ShopItem,
    Wallet,
)

router = APIRouter(tags=["shop"])

# DB 함수가 raise 하는 메시지 → (상태 코드, 화면에 보여줄 문장)
# (위에서부터 찾는다: effect_not_owned 가 not_owned 를 포함하므로 더 긴 이름을 먼저 둔다)
_DB_ERRORS = {
    "effect_not_owned": (403, "가지고 있는 행성 효과가 아닙니다. 상점에서 먼저 구매해 주세요."),
    "effect_all_used": (409, "이 효과를 모두 다른 행성에 쓰고 있어요. 하나 더 구매하거나 다른 행성에서 해제해 주세요."),
    "diary_not_found": (404, "내 일기의 행성이 아닙니다."),
    "item_not_found": (404, "판매 중인 아이템이 아닙니다."),
    "already_owned": (409, "이미 가지고 있는 아이템입니다."),
    "not_enough_coins": (400, "코인이 부족합니다."),
    "not_owned": (404, "가지고 있는 장착 아이템이 아닙니다."),
}

# 행성 효과 아이템의 칸(slot)과 앱이 그릴 수 있는 효과 종류
PLANET_EFFECT_SLOT = "planet_effect"
SPECIAL_TYPES = ("ocean", "cloud", "crystal", "nebula", "lava")
_MISSING_TABLE_CODES = ("PGRST205", "42P01")

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


# [ADDED 2026-11-09] 관리자 화면에서 바꿀 수 있는 설정값. 새 설정은 여기에 한 줄 추가하면 된다.
#   key: (설명, 종류, 표에 값이 없을 때 기본값, 값 검사 함수)
def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 100000


CONFIG_KEYS = {
    "start_coins": ("처음 가입한 사람이 받는 코인 (테스트 999, 배포 0)", "int", 0, _is_int),
    "allow_test_reset": (
        "상점의 '내 상점 초기화(테스트용)' 버튼 허용 (배포할 때 끄기)",
        "bool",
        True,
        lambda v: isinstance(v, bool),
    ),
}


def get_config(key: str):
    rows = supabase.table("app_config").select("value").eq("key", key).execute().data
    return rows[0]["value"] if rows else CONFIG_KEYS[key][2]


def reset_user_shop(user_id: str) -> int:
    """코인·보유 아이템·코인 기록을 지우고 시작 코인으로 새 지갑을 만든다 (테스트용).
    산 효과가 없어지므로 행성에 적용한 효과도 함께 지운다(행성 본체·일기는 그대로)."""
    try:
        supabase.table("planet_effects").delete().eq("user_id", user_id).execute()
    except APIError as e:
        if e.code not in _MISSING_TABLE_CODES:  # 행성 효과 마이그레이션 전이면 지울 것도 없다
            raise
    supabase.table("user_items").delete().eq("user_id", user_id).execute()
    supabase.table("coin_logs").delete().eq("user_id", user_id).execute()
    supabase.table("wallets").delete().eq("user_id", user_id).execute()
    return ensure_wallet(user_id)


@router.get("/me/wallet", response_model=Wallet)
def get_wallet(user_id: str = Depends(get_current_user_id)):
    return Wallet(coins=ensure_wallet(user_id), reset_allowed=bool(get_config("allow_test_reset")))


@router.post("/me/shop/reset", response_model=Wallet)
def reset_my_shop(user_id: str = Depends(get_current_user_id)):
    """[ADDED 2026-11-09] 테스트용: 내 코인을 시작 코인으로, 산 아이템·기록은 전부 삭제."""
    if not get_config("allow_test_reset"):
        raise HTTPException(status_code=403, detail="초기화가 꺼져 있습니다 (관리자 설정).")
    return Wallet(coins=reset_user_shop(user_id), reset_allowed=True)


@router.get("/shop/items", response_model=list[ShopItem])
def list_shop_items(user_id: str = Depends(get_current_user_id)):
    """판매 중인 아이템 + (판매가 끝났어도) 내가 가진 아이템."""
    try:
        items = supabase.table("items").select("*").order("sort_order").execute().data
        owned = supabase.table("user_items").select("*").eq("user_id", user_id).execute().data
    except APIError as e:
        if e.code in _MISSING_TABLE_CODES:
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


# --- 행성 특수 효과 (2026-11-12) ---------------------------------------------------------


def special_of(effect: dict | None) -> str | None:
    """아이템 effect JSON → 화면이 그릴 효과 종류. 행성 효과 아이템이 아니거나 모르는 값이면 None."""
    if not isinstance(effect, dict) or effect.get("type") != PLANET_EFFECT_SLOT:
        return None
    special = effect.get("special")
    return special if special in SPECIAL_TYPES else None


def applied_effects(user_id: str) -> dict[str, dict]:
    """내 행성에 적용한 효과: {diary_id: {"item_id", "effect"}}.
    별 목록 조회 때 쓴다. 행성 효과 표가 아직 없으면(마이그레이션 전) 빈 값 → 모든 행성이 일반 행성."""
    try:
        rows = supabase.table("planet_effects").select("diary_id, item_id").eq("user_id", user_id).execute().data
        if not rows:
            return {}
        items = supabase.table("items").select("id, effect").eq("slot", PLANET_EFFECT_SLOT).execute().data
    except APIError as e:
        if e.code in _MISSING_TABLE_CODES:
            return {}
        raise
    special_by_item = {i["id"]: special_of(i.get("effect")) for i in items}
    result = {}
    for row in rows:
        special = special_by_item.get(row["item_id"])
        if special:
            result[str(row["diary_id"])] = {"item_id": row["item_id"], "effect": special}
    return result


@router.put("/diaries/{diary_id}/effect", response_model=PlanetEffectResult)
def set_planet_effect(
    diary_id: UUID, payload: PlanetEffectRequest, user_id: str = Depends(get_current_user_id)
):
    """내 일기 행성에 산 효과를 적용(또는 다른 효과로 변경). item_id 가 null 이면 효과 해제.
    일기 주인·남은 개수 확인과 저장은 DB 함수가 한 번에 한다
    (남의 행성, 사지 않은 효과, 산 개수를 모두 다른 행성에 쓰고 있는 효과는 거절)."""
    data = call_db_function(
        "apply_planet_effect", {"p_user": user_id, "p_diary": str(diary_id), "p_item": payload.item_id}
    )
    item_id = (data or {}).get("item_id")
    effect = None
    if item_id:
        rows = supabase.table("items").select("effect").eq("id", item_id).execute().data
        effect = special_of(rows[0].get("effect")) if rows else None
    return PlanetEffectResult(diary_id=str(diary_id), item_id=item_id, effect=effect)
