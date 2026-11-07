"""상점 · 코인 API 테스트 (DB 함수는 가짜로 대신한다).

DB 함수 자체(코인 차감, 중복 구매 막기 등)는 migrations/2026-11-07_shop_coins.sql 에 있고
실제 Postgres 에서 따로 검증했다. 여기서는 라우터가 결과·오류를 올바르게 전달하는지만 본다.
"""

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

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        match = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        if self.op == "select":
            return _Result([dict(r) for r in match])
        if self.op == "insert":
            rows.append(dict(self.payload))
            return _Result([dict(self.payload)])
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
    assert shop.get_wallet(user_id="u1").coins == 999
    assert fake.rpc_calls == [("ensure_wallet", {"p_user": "u1"})]


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
    assert [(e.key, e.value) for e in entries] == [("start_coins", 999)]

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
