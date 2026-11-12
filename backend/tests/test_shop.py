"""상점 · 코인 API 테스트 (DB 함수는 가짜로 대신한다).

DB 함수 자체(코인 차감, 중복 구매 막기 등)는 migrations/2026-11-07_shop_coins.sql 에 있고
실제 Postgres 에서 따로 검증했다. 여기서는 라우터가 결과·오류를 올바르게 전달하는지만 본다.
"""

from uuid import UUID

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.routers import admin_shop, shop
from app.schemas.shop import (
    AdminCoinAdjust,
    AdminConfigUpdate,
    AdminItemCreate,
    AdminItemUpdate,
    EquipRequest,
    PlanetEffectRequest,
    PurchaseRequest,
)

ITEMS = [
    {"id": "prism", "name": "프리즘", "icon": "❄️", "description": "", "price": 30, "kind": "consumable",
     "slot": None, "effect": {"type": "streak_shield"}, "is_active": True, "sort_order": 10},
    {"id": "blue", "name": "배경 (blue)", "icon": "🌌", "description": "", "price": 50, "kind": "equip",
     "slot": "background", "effect": {"type": "background"}, "is_active": True, "sort_order": 20},
    {"id": "old", "name": "단종", "icon": "⭐", "description": "", "price": 10, "kind": "equip",
     "slot": "effect", "effect": {}, "is_active": False, "sort_order": 30},
    {"id": "gone", "name": "안 산 단종", "icon": "⭐", "description": "", "price": 10, "kind": "equip",
     "slot": "effect", "effect": {}, "is_active": False, "sort_order": 40},
]


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters, self.payload, self.op = {}, None, "select"

    def select(self, *_a, **_k):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload):
        self.op, self.payload = "upsert", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        match = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        if self.op == "select":
            return _Result([dict(r) for r in match])
        if self.op == "insert":
            rows.append(dict(self.payload))
            return _Result([dict(self.payload)])
        if self.op == "delete":
            rows[:] = [r for r in rows if r not in match]
            return _Result(match)
        if self.op == "update":
            for r in match:
                r.update(self.payload)
            return _Result([dict(r) for r in match])
        # upsert (app_config: key 기준)
        rows[:] = [r for r in rows if r.get("key") != self.payload.get("key")] + [dict(self.payload)]
        return _Result([dict(self.payload)])


class _Rpc:
    def __init__(self, fn):
        self.fn = fn

    def execute(self):
        return _Result(self.fn())


class _FakeSupabase:
    def __init__(self, tables=None, rpc_handlers=None):
        self.tables = tables or {}
        self.rpc_handlers = rpc_handlers or {}
        self.rpc_calls = []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        handler = self.rpc_handlers[name]
        return _Rpc(lambda: handler(**params))


def _raise(message, code="P0001"):
    def handler(**_params):
        raise APIError({"message": message, "code": code})

    return handler


@pytest.fixture
def fake(monkeypatch):
    db = _FakeSupabase(
        tables={
            "items": [dict(i) for i in ITEMS],
            "user_items": [
                {"user_id": "u1", "item_id": "blue", "quantity": 1, "equipped": True},
                {"user_id": "u1", "item_id": "old", "quantity": 1, "equipped": False},
                {"user_id": "u2", "item_id": "prism", "quantity": 3, "equipped": False},
            ],
            "app_config": [{"key": "start_coins", "value": 999}],
        },
        rpc_handlers={"ensure_wallet": lambda p_user: 999},
    )
    monkeypatch.setattr(shop, "supabase", db)
    monkeypatch.setattr(admin_shop, "supabase", db)
    return db


# --- 사용자 ---------------------------------------------------------------------


def test_wallet_returns_coins_and_creates_wallet(fake):
    wallet = shop.get_wallet(user_id="u1")
    assert wallet.coins == 999
    assert wallet.reset_allowed is True  # 설정이 없으면 기본값(허용)
    assert fake.rpc_calls == [("ensure_wallet", {"p_user": "u1"})]


def test_reset_my_shop_clears_only_my_data(fake):
    fake.tables["wallets"] = [{"user_id": "u1", "coins": 10}, {"user_id": "u2", "coins": 50}]
    fake.tables["coin_logs"] = [{"user_id": "u1", "delta": 1}, {"user_id": "u2", "delta": 2}]

    wallet = shop.reset_my_shop(user_id="u1")

    assert wallet.coins == 999  # ensure_wallet 이 시작 코인으로 새로 만든다
    assert [r["user_id"] for r in fake.tables["user_items"]] == ["u2"]
    assert [r["user_id"] for r in fake.tables["wallets"]] == ["u2"]
    assert [r["user_id"] for r in fake.tables["coin_logs"]] == ["u2"]


def test_reset_blocked_when_admin_turns_it_off(fake):
    fake.tables["app_config"].append({"key": "allow_test_reset", "value": False})

    assert shop.get_wallet(user_id="u1").reset_allowed is False
    with pytest.raises(HTTPException) as exc:
        shop.reset_my_shop(user_id="u1")
    assert exc.value.status_code == 403
    assert len(fake.tables["user_items"]) == 3  # 아무것도 안 지움


def test_shop_items_show_owned_state_and_hide_unowned_discontinued(fake):
    items = {i.id: i for i in shop.list_shop_items(user_id="u1")}

    assert set(items) == {"prism", "blue", "old"}  # 'gone' 은 단종 + 미보유라 숨김
    assert items["blue"].quantity == 1 and items["blue"].equipped and items["blue"].on_sale
    assert items["old"].on_sale is False and items["old"].quantity == 1
    assert items["prism"].quantity == 0  # 다른 사람(u2)의 보유분은 섞이지 않는다


def test_purchase_returns_new_balance(fake):
    fake.rpc_handlers["purchase_item"] = lambda p_user, p_item: {"coins": 949, "item_id": p_item, "quantity": 1}

    result = shop.purchase(PurchaseRequest(item_id="blue"), user_id="u1")

    assert result.coins == 949
    assert fake.rpc_calls[-1] == ("purchase_item", {"p_user": "u1", "p_item": "blue"})


@pytest.mark.parametrize(
    "message,status",
    [("not_enough_coins", 400), ("already_owned", 409), ("item_not_found", 404)],
)
def test_purchase_errors_become_http_errors(fake, message, status):
    fake.rpc_handlers["purchase_item"] = _raise(message)

    with pytest.raises(HTTPException) as exc:
        shop.purchase(PurchaseRequest(item_id="blue"), user_id="u1")

    assert exc.value.status_code == status


def test_missing_migration_gives_clear_503(fake):
    fake.rpc_handlers["ensure_wallet"] = _raise("Could not find the function public.ensure_wallet", "PGRST202")

    with pytest.raises(HTTPException) as exc:
        shop.get_wallet(user_id="u1")

    assert exc.value.status_code == 503 and "2026-11-07_shop_coins.sql" in exc.value.detail


def test_unknown_db_error_is_not_hidden(fake):
    fake.rpc_handlers["ensure_wallet"] = _raise("connection lost", "XX000")

    with pytest.raises(APIError):
        shop.get_wallet(user_id="u1")


def test_equip_calls_db_and_maps_not_owned(fake):
    fake.rpc_handlers["equip_item"] = lambda p_user, p_item, p_on: None
    shop.set_equipped("blue", EquipRequest(equipped=False), user_id="u1")
    assert fake.rpc_calls[-1] == ("equip_item", {"p_user": "u1", "p_item": "blue", "p_on": False})

    fake.rpc_handlers["equip_item"] = _raise("not_owned")
    with pytest.raises(HTTPException) as exc:
        shop.set_equipped("prism", EquipRequest(equipped=True), user_id="u1")
    assert exc.value.status_code == 404


# --- 관리자 ---------------------------------------------------------------------


def test_admin_create_item_and_reject_duplicate(fake):
    created = admin_shop.admin_create_item(
        AdminItemCreate(id="red", name="배경 (red)", price=40, kind="equip", slot="background"), admin_id="a"
    )
    assert created["id"] == "red"

    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_create_item(AdminItemCreate(id="red", name="x", price=1, kind="consumable"), admin_id="a")
    assert exc.value.status_code == 409


def test_admin_item_validation():
    with pytest.raises(ValueError):
        AdminItemCreate(id="x", name="x", price=1, kind="equip")  # slot 없음
    with pytest.raises(ValueError):
        AdminItemCreate(id="x", name="x", price=-1, kind="consumable")  # 음수 가격
    with pytest.raises(ValueError):
        AdminItemCreate(id="Bad Id", name="x", price=1, kind="consumable")  # id 형식


def test_admin_update_item_price_and_sale(fake):
    updated = admin_shop.admin_update_item("blue", AdminItemUpdate(price=70, is_active=False), admin_id="a")
    assert updated["price"] == 70 and updated["is_active"] is False

    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_update_item("nope", AdminItemUpdate(price=1), admin_id="a")
    assert exc.value.status_code == 404

    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_update_item("blue", AdminItemUpdate(slot=None), admin_id="a")
    assert exc.value.status_code == 422


def test_admin_config_start_coins(fake):
    entries = admin_shop.admin_list_config(admin_id="a")
    assert [(e.key, e.value, e.kind) for e in entries] == [
        ("start_coins", 999, "int"),
        ("allow_test_reset", True, "bool"),  # 표에 없으면 기본값
    ]
    assert admin_shop.admin_set_config("allow_test_reset", AdminConfigUpdate(value=False), admin_id="a").value is False
    with pytest.raises(HTTPException):
        admin_shop.admin_set_config("allow_test_reset", AdminConfigUpdate(value=0), admin_id="a")
    fake.tables["app_config"] = [r for r in fake.tables["app_config"] if r["key"] == "start_coins"]

    assert admin_shop.admin_set_config("start_coins", AdminConfigUpdate(value=0), admin_id="a").value == 0
    assert fake.tables["app_config"] == [{"key": "start_coins", "value": 0, "updated_at": fake.tables["app_config"][0]["updated_at"]}]

    for bad in (-1, "10", 1.5, True):
        with pytest.raises(HTTPException):
            admin_shop.admin_set_config("start_coins", AdminConfigUpdate(value=bad), admin_id="a")
    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_set_config("unknown", AdminConfigUpdate(value=1), admin_id="a")
    assert exc.value.status_code == 404


def test_admin_adjust_coins(fake):
    fake.rpc_handlers["adjust_coins"] = lambda p_user, p_delta, p_reason, p_ref: 999 + p_delta
    assert admin_shop.admin_adjust_coins("u1", AdminCoinAdjust(delta=100, memo="테스트"), admin_id="a").coins == 1099
    assert fake.rpc_calls[-1] == (
        "adjust_coins", {"p_user": "u1", "p_delta": 100, "p_reason": "admin", "p_ref": "테스트"}
    )

    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_adjust_coins("u1", AdminCoinAdjust(delta=0), admin_id="a")
    assert exc.value.status_code == 422

    fake.rpc_handlers["adjust_coins"] = _raise("not_enough_coins")
    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_adjust_coins("u1", AdminCoinAdjust(delta=-5000), admin_id="a")
    assert exc.value.status_code == 400

    fake.rpc_handlers["adjust_coins"] = _raise("violates foreign key constraint", "23503")
    with pytest.raises(HTTPException) as exc:
        admin_shop.admin_adjust_coins("nobody", AdminCoinAdjust(delta=5), admin_id="a")
    assert exc.value.status_code == 404


def test_admin_reset_wallet_ignores_user_switch(fake):
    fake.tables["app_config"].append({"key": "allow_test_reset", "value": False})
    assert admin_shop.admin_reset_wallet("u2", admin_id="a").coins == 999
    assert [r["user_id"] for r in fake.tables["user_items"]] == ["u1", "u1"]


# --- 행성 특수 효과 (2026-11-12) ---------------------------------------------------------

DIARY = "11111111-1111-1111-1111-111111111111"
FX_ITEMS = [
    {"id": "fx_ocean", "name": "바다 효과", "icon": "🌊", "description": "", "price": 100, "kind": "consumable",
     "slot": "planet_effect", "effect": {"type": "planet_effect", "special": "ocean"}, "is_active": True, "sort_order": 70},
    {"id": "fx_nebula", "name": "성운 효과", "icon": "🌌", "description": "", "price": 100, "kind": "consumable",
     "slot": "planet_effect", "effect": {"type": "planet_effect", "special": "nebula"}, "is_active": True, "sort_order": 100},
    {"id": "fx_weird", "name": "모르는 효과", "icon": "?", "description": "", "price": 1, "kind": "consumable",
     "slot": "planet_effect", "effect": {"type": "planet_effect", "special": "sparkle"}, "is_active": True, "sort_order": 120},
]


@pytest.fixture
def fx(fake):
    fake.tables["items"] += [dict(i) for i in FX_ITEMS]
    fake.rpc_handlers["apply_planet_effect"] = lambda p_user, p_diary, p_item: {"diary_id": p_diary, "item_id": p_item}
    return fake


def test_apply_effect_calls_db_function_and_returns_effect_type(fx):
    result = shop.set_planet_effect(UUID(DIARY), PlanetEffectRequest(item_id="fx_ocean"), user_id="u1")

    assert fx.rpc_calls[-1] == ("apply_planet_effect", {"p_user": "u1", "p_diary": DIARY, "p_item": "fx_ocean"})
    assert (result.diary_id, result.item_id, result.effect) == (DIARY, "fx_ocean", "ocean")


def test_remove_effect_sends_null(fx):
    result = shop.set_planet_effect(UUID(DIARY), PlanetEffectRequest(item_id=None), user_id="u1")

    assert fx.rpc_calls[-1][1]["p_item"] is None
    assert result.item_id is None and result.effect is None


@pytest.mark.parametrize(
    "message,status",
    # 사지 않은 효과 → 403 (not_owned 와 이름이 겹쳐도 행성 효과 문장이 나와야 한다), 남의 일기 → 404
    # 산 개수를 모두 다른 행성에 쓰는 중 → 409
    [("effect_not_owned", 403), ("diary_not_found", 404), ("effect_all_used", 409)],
)
def test_apply_effect_errors(fx, message, status):
    fx.rpc_handlers["apply_planet_effect"] = _raise(message)

    with pytest.raises(HTTPException) as exc:
        shop.set_planet_effect(UUID(DIARY), PlanetEffectRequest(item_id="fx_ocean"), user_id="u1")

    assert exc.value.status_code == status
    if message == "effect_not_owned":
        assert "행성 효과" in exc.value.detail
    if message == "effect_all_used":
        assert "하나 더 구매" in exc.value.detail


def test_applied_effects_maps_my_planets_only(fx):
    fx.tables["planet_effects"] = [
        {"diary_id": "d1", "user_id": "u1", "item_id": "fx_ocean"},
        {"diary_id": "d2", "user_id": "u1", "item_id": "fx_weird"},  # 앱이 모르는 효과 → 일반 행성
        {"diary_id": "d3", "user_id": "u2", "item_id": "fx_nebula"},  # 다른 사람 행성
    ]

    assert shop.applied_effects("u1") == {"d1": {"item_id": "fx_ocean", "effect": "ocean"}}
    assert shop.applied_effects("u2") == {"d3": {"item_id": "fx_nebula", "effect": "nebula"}}


def test_applied_effects_before_migration_is_empty(fake, monkeypatch):
    def missing(*_a, **_k):
        raise APIError({"message": "relation planet_effects does not exist", "code": "42P01"})

    monkeypatch.setattr(_Query, "execute", missing)
    assert shop.applied_effects("u1") == {}


def test_reset_shop_also_clears_my_applied_effects(fx):
    fx.tables["planet_effects"] = [
        {"diary_id": "d1", "user_id": "u1", "item_id": "fx_ocean"},
        {"diary_id": "d3", "user_id": "u2", "item_id": "fx_nebula"},
    ]

    shop.reset_my_shop(user_id="u1")

    assert [r["user_id"] for r in fx.tables["planet_effects"]] == ["u2"]


def test_effect_items_listed_as_consumables_with_count(fx):
    fx.tables["user_items"].append({"user_id": "u1", "item_id": "fx_ocean", "quantity": 2, "equipped": False})
    items = {i.id: i for i in shop.list_shop_items(user_id="u1")}

    assert items["fx_ocean"].slot == "planet_effect" and items["fx_ocean"].quantity == 2  # 산 개수 = 쓸 수 있는 행성 수
    assert items["fx_ocean"].kind == "consumable"
    assert items["fx_nebula"].quantity == 0 and items["fx_nebula"].price == 100


def test_admin_keeps_slot_for_consumable_planet_effects(fx):
    # 소모품이라도 칸(planet_effect)을 지우면 행성 효과가 일반 소모품이 되므로 저장해야 한다
    created = admin_shop.admin_create_item(
        AdminItemCreate(id="fx_star", name="별빛 효과", price=100, kind="consumable", slot="planet_effect",
                        effect={"type": "planet_effect", "special": "crystal"}), admin_id="a"
    )
    assert created["slot"] == "planet_effect"
    plain = admin_shop.admin_create_item(AdminItemCreate(id="snack", name="간식", price=1, kind="consumable", slot="  "), admin_id="a")
    assert plain["slot"] is None
