"""관리자: 상점 아이템 · 설정값 · 사용자 코인 (2026-11-07).

Supabase 표를 직접 고치지 않아도 관리자 화면에서 값을 바꿀 수 있게 한다.
바꾼 값은 저장 즉시 앱에 반영된다 (코드 수정·재배포 없음).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.db import supabase
from app.dependencies import get_current_admin_id
from app.routers.admin_data import _list_all_auth_users, _nickname_by_user_id
from app.routers.shop import call_db_function
from app.schemas.shop import (
    AdminCoinAdjust,
    AdminConfigEntry,
    AdminConfigUpdate,
    AdminItem,
    AdminItemCreate,
    AdminItemUpdate,
    AdminWallet,
    CoinLog,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

# 관리자 화면에서 바꿀 수 있는 설정값. 새 설정은 여기에 한 줄 추가하면 된다.
#   key: (설명, 값 검사 함수)
CONFIG_KEYS = {
    "start_coins": ("처음 가입한 사람이 받는 코인 (테스트 999, 배포 0)", lambda v: isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 100000),
}


# --- 아이템 ---------------------------------------------------------------------


@router.get("/items", response_model=list[AdminItem])
def admin_list_items(admin_id: str = Depends(get_current_admin_id)):
    return supabase.table("items").select("*").order("sort_order").execute().data


@router.post("/items", response_model=AdminItem, status_code=201)
def admin_create_item(payload: AdminItemCreate, admin_id: str = Depends(get_current_admin_id)):
    exists = supabase.table("items").select("id").eq("id", payload.id).execute().data
    if exists:
        raise HTTPException(status_code=409, detail="같은 id의 아이템이 이미 있습니다.")
    row = payload.model_dump()
    if row["kind"] == "consumable":
        row["slot"] = None
    return supabase.table("items").insert(row).execute().data[0]


@router.patch("/items/{item_id}", response_model=AdminItem)
def admin_update_item(item_id: str, payload: AdminItemUpdate, admin_id: str = Depends(get_current_admin_id)):
    existing = supabase.table("items").select("*").eq("id", item_id).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="아이템이 없습니다.")
    changes = payload.model_dump(exclude_unset=True)
    if existing[0]["kind"] == "equip" and "slot" in changes and not changes["slot"]:
        raise HTTPException(status_code=422, detail="장착 아이템(equip)은 slot을 비울 수 없습니다.")
    if not changes:
        return existing[0]
    changes["updated_at"] = _now()
    return supabase.table("items").update(changes).eq("id", item_id).execute().data[0]


# --- 설정값 ---------------------------------------------------------------------


@router.get("/config", response_model=list[AdminConfigEntry])
def admin_list_config(admin_id: str = Depends(get_current_admin_id)):
    rows = supabase.table("app_config").select("*").execute().data
    value_by_key = {r["key"]: r["value"] for r in rows}
    return [
        AdminConfigEntry(key=key, value=value_by_key.get(key), description=desc)
        for key, (desc, _check) in CONFIG_KEYS.items()
    ]


@router.put("/config/{key}", response_model=AdminConfigEntry)
def admin_set_config(key: str, payload: AdminConfigUpdate, admin_id: str = Depends(get_current_admin_id)):
    if key not in CONFIG_KEYS:
        raise HTTPException(status_code=404, detail="바꿀 수 없는 설정입니다.")
    desc, check = CONFIG_KEYS[key]
    if not check(payload.value):
        raise HTTPException(status_code=422, detail=f"값이 올바르지 않습니다: {desc}")
    supabase.table("app_config").upsert({"key": key, "value": payload.value, "updated_at": _now()}).execute()
    return AdminConfigEntry(key=key, value=payload.value, description=desc)


# --- 사용자 코인 ------------------------------------------------------------------


@router.get("/wallets", response_model=list[AdminWallet])
def admin_list_wallets(admin_id: str = Depends(get_current_admin_id)):
    wallets = supabase.table("wallets").select("user_id, coins").execute().data
    coins_by_user = {w["user_id"]: w["coins"] for w in wallets}
    nickname_by_user = _nickname_by_user_id()
    return [
        AdminWallet(
            user_id=u.id,
            email=u.email,
            nickname=nickname_by_user.get(u.id),
            coins=coins_by_user.get(u.id),
        )
        for u in _list_all_auth_users()
    ]


@router.post("/wallets/{user_id}/adjust", response_model=AdminWallet)
def admin_adjust_coins(user_id: str, payload: AdminCoinAdjust, admin_id: str = Depends(get_current_admin_id)):
    if payload.delta == 0:
        raise HTTPException(status_code=422, detail="0이 아닌 값을 입력해 주세요.")
    try:
        coins = call_db_function(
            "adjust_coins",
            {"p_user": user_id, "p_delta": payload.delta, "p_reason": "admin", "p_ref": payload.memo or None},
        )
    except APIError as e:
        # 없는 사용자 (auth.users 외래키 위반)
        if e.code == "23503":
            raise HTTPException(status_code=404, detail="사용자가 없습니다.")
        raise
    return AdminWallet(user_id=user_id, coins=int(coins))


@router.get("/wallets/{user_id}/logs", response_model=list[CoinLog])
def admin_coin_logs(user_id: str, admin_id: str = Depends(get_current_admin_id)):
    return (
        supabase.table("coin_logs")
        .select("delta, balance, reason, ref, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
    )
