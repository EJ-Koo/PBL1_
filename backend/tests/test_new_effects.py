"""[2026-11-21] 신규 특수 효과 3종(천상의 고리·공전하는 위성·별똥별). 기존 효과 구매·적용 흐름을 그대로 쓰는지 확인한다."""

from pathlib import Path
from uuid import UUID

import pytest

from app.routers import shop
from app.schemas.shop import PlanetEffectRequest
from tests.test_shop import FX_ITEMS
from tests.test_shop import fake  # noqa: F401  (pytest fixture)

DIARY = "33333333-3333-3333-3333-333333333333"
NEW = ("celestial_ring", "orbiting_moons", "shooting_stars")
NEW_ITEMS = [
    {"id": f"fx_{t}", "name": t, "icon": "✨", "description": "", "price": 100, "kind": "consumable",
     "slot": "planet_effect", "effect": {"type": "planet_effect", "special": t}, "is_active": True, "sort_order": 112 + i * 2}
    for i, t in enumerate(NEW)
]


@pytest.fixture
def fx(fake):  # noqa: F811
    fake.tables["items"] += [dict(i) for i in FX_ITEMS] + [dict(i) for i in NEW_ITEMS]
    fake.rpc_handlers["apply_planet_effect"] = lambda p_user, p_diary, p_item: {"diary_id": p_diary, "item_id": p_item}
    return fake


def test_special_types_keep_old_and_add_new():
    assert shop.SPECIAL_TYPES[:5] == ("ocean", "cloud", "crystal", "nebula", "lava")
    assert shop.SPECIAL_TYPES[5:] == NEW
    for t in NEW:
        assert shop.special_of({"type": "planet_effect", "special": t}) == t


@pytest.mark.parametrize("special", NEW)
def test_apply_new_effect_uses_same_db_function(fx, special):
    result = shop.set_planet_effect(UUID(DIARY), PlanetEffectRequest(item_id=f"fx_{special}"), user_id="u1")
    assert fx.rpc_calls[-1][0] == "apply_planet_effect"
    assert (result.item_id, result.effect) == (f"fx_{special}", special)


def test_applied_effects_reads_new_and_old(fx):
    fx.tables["planet_effects"] = [
        {"diary_id": "d1", "user_id": "u1", "item_id": "fx_ocean"},
        {"diary_id": "d2", "user_id": "u1", "item_id": "fx_celestial_ring"},
        {"diary_id": "d3", "user_id": "u1", "item_id": "fx_shooting_stars"},
    ]
    assert shop.applied_effects("u1") == {
        "d1": {"item_id": "fx_ocean", "effect": "ocean"},
        "d2": {"item_id": "fx_celestial_ring", "effect": "celestial_ring"},
        "d3": {"item_id": "fx_shooting_stars", "effect": "shooting_stars"},
    }


def test_new_items_listed_like_old_effects(fx):
    items = {i.id: i for i in shop.list_shop_items(user_id="u1")}
    for t in NEW:
        it = items[f"fx_{t}"]
        assert (it.slot, it.kind, it.price, it.quantity) == ("planet_effect", "consumable", 100, 0)
    assert items["fx_ocean"].price == 100  # 기존 효과 가격과 같다


def test_migration_only_inserts_three_items():
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "2026-11-21_new_planet_effects.sql").read_text(encoding="utf-8")
    body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--")).lower()
    for forbidden in ("drop ", "truncate", "delete ", "update ", "alter ", "create table", "create or replace function"):
        assert forbidden not in body, forbidden
    assert "on conflict (id) do nothing" in body
    for t in NEW:
        assert f"'fx_{t}'" in body and f'"special":"{t}"' in body
    assert body.count("'planet_effect'") == 3
