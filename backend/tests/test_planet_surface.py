"""[2026-11-21] 행성 표면 스타일(상점 '행성 표면'). 행성 효과와 따로 저장되고, 감정 분석 결과·좌표·크기는 바꾸지 않는다.

DB 함수(apply_planet_surface) 자체는 migrations/2026-11-21_planet_surfaces.sql 이고 로컬 Postgres 에서 따로 검증한다.
여기서는 라우터가 결과·오류를 올바르게 전달하는지, 기존 응답(효과·감정 외형)이 그대로인지 본다.
"""

from pathlib import Path
from uuid import UUID

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.routers import shop, stars
from app.schemas.shop import PlanetEffectRequest, PlanetSurfaceRequest
from tests.test_shop import FX_ITEMS, _Query, _raise
from tests.test_shop import fake  # noqa: F401  (pytest fixture)
from tests.test_special_planet import _ROWS, _VISUAL, _StarsDB

DIARY = "22222222-2222-2222-2222-222222222222"
SF_ITEMS = [
    {"id": "sf_opal_glass", "name": "오팔 유리구슬 표면", "icon": "🔮", "description": "", "price": 120, "kind": "consumable",
     "slot": "planet_surface", "effect": {"type": "planet_surface", "surface": "opal_glass"}, "is_active": True, "sort_order": 120},
    {"id": "sf_pearl_silk", "name": "진주 실크 표면", "icon": "🦪", "description": "", "price": 120, "kind": "consumable",
     "slot": "planet_surface", "effect": {"type": "planet_surface", "surface": "pearl_silk"}, "is_active": True, "sort_order": 140},
    {"id": "sf_weird", "name": "모르는 표면", "icon": "?", "description": "", "price": 1, "kind": "consumable",
     "slot": "planet_surface", "effect": {"type": "planet_surface", "surface": "glitter"}, "is_active": True, "sort_order": 170},
]


@pytest.fixture
def sf(fake):  # noqa: F811
    fake.tables["items"] += [dict(i) for i in FX_ITEMS] + [dict(i) for i in SF_ITEMS]
    fake.rpc_handlers["apply_planet_surface"] = lambda p_user, p_diary, p_item: {"diary_id": p_diary, "item_id": p_item}
    fake.rpc_handlers["apply_planet_effect"] = lambda p_user, p_diary, p_item: {"diary_id": p_diary, "item_id": p_item}
    return fake


def test_surface_of_reads_only_surface_items():
    assert shop.surface_of({"type": "planet_surface", "surface": "opal_glass"}) == "opal_glass"
    assert shop.surface_of({"type": "planet_surface", "surface": "glitter"}) is None  # 앱이 모르는 값
    assert shop.surface_of({"type": "planet_effect", "special": "ocean"}) is None  # 행성 효과 아이템은 표면이 아니다
    assert shop.surface_of(None) is None
    # 반대로 표면 아이템은 효과로 읽히지 않는다(두 카테고리가 섞이지 않음)
    assert shop.special_of({"type": "planet_surface", "surface": "opal_glass"}) is None


def test_apply_surface_calls_db_function_and_returns_style(sf):
    result = shop.set_planet_surface(UUID(DIARY), PlanetSurfaceRequest(item_id="sf_pearl_silk"), user_id="u1")

    assert sf.rpc_calls[-1] == ("apply_planet_surface", {"p_user": "u1", "p_diary": DIARY, "p_item": "sf_pearl_silk"})
    assert (result.diary_id, result.item_id, result.surface) == (DIARY, "sf_pearl_silk", "pearl_silk")


def test_remove_surface_sends_null(sf):
    result = shop.set_planet_surface(UUID(DIARY), PlanetSurfaceRequest(item_id=None), user_id="u1")

    assert sf.rpc_calls[-1][1]["p_item"] is None
    assert result.item_id is None and result.surface is None


@pytest.mark.parametrize(
    "message,status,text",
    [("surface_not_owned", 403, "행성 표면"), ("diary_not_found", 404, "내 일기"), ("surface_all_used", 409, "하나 더 구매")],
)
def test_apply_surface_errors(sf, message, status, text):
    sf.rpc_handlers["apply_planet_surface"] = _raise(message)

    with pytest.raises(HTTPException) as exc:
        shop.set_planet_surface(UUID(DIARY), PlanetSurfaceRequest(item_id="sf_opal_glass"), user_id="u1")

    assert exc.value.status_code == status
    assert text in exc.value.detail


def test_effect_error_messages_unchanged(sf):
    # 표면 오류 이름을 앞에 추가했어도 기존 효과 오류 문장은 그대로여야 한다
    sf.rpc_handlers["apply_planet_effect"] = _raise("effect_not_owned")
    with pytest.raises(HTTPException) as exc:
        shop.set_planet_effect(UUID(DIARY), PlanetEffectRequest(item_id="fx_ocean"), user_id="u1")
    assert exc.value.status_code == 403 and "행성 효과" in exc.value.detail


def test_applied_surfaces_maps_my_planets_only(sf):
    sf.tables["planet_surfaces"] = [
        {"diary_id": "d1", "user_id": "u1", "item_id": "sf_opal_glass"},
        {"diary_id": "d2", "user_id": "u1", "item_id": "sf_weird"},  # 앱이 모르는 표면 → 기본 표면
        {"diary_id": "d3", "user_id": "u2", "item_id": "sf_pearl_silk"},  # 다른 사람 행성
    ]

    assert shop.applied_surfaces("u1") == {"d1": {"item_id": "sf_opal_glass", "surface": "opal_glass"}}
    assert shop.applied_surfaces("u2") == {"d3": {"item_id": "sf_pearl_silk", "surface": "pearl_silk"}}


def test_applied_surfaces_before_migration_is_empty(fake, monkeypatch):  # noqa: F811
    # 운영 DB 처럼 아직 표가 없으면 모든 행성이 기본 표면(기존과 같음)이고 오류가 나지 않는다
    def missing(*_a, **_k):
        raise APIError({"message": "relation planet_surfaces does not exist", "code": "42P01"})

    monkeypatch.setattr(_Query, "execute", missing)
    assert shop.applied_surfaces("u1") == {}


def test_reset_shop_clears_my_surfaces_and_effects(sf):
    sf.tables["planet_surfaces"] = [
        {"diary_id": "d1", "user_id": "u1", "item_id": "sf_opal_glass"},
        {"diary_id": "d3", "user_id": "u2", "item_id": "sf_pearl_silk"},
    ]
    sf.tables["planet_effects"] = [{"diary_id": "d1", "user_id": "u1", "item_id": "fx_ocean"}]

    shop.reset_my_shop(user_id="u1")

    assert [r["user_id"] for r in sf.tables["planet_surfaces"]] == ["u2"]
    assert sf.tables["planet_effects"] == []


def test_surface_items_listed_as_consumables(sf):
    sf.tables["user_items"].append({"user_id": "u1", "item_id": "sf_opal_glass", "quantity": 2, "equipped": False})
    items = {i.id: i for i in shop.list_shop_items(user_id="u1")}

    assert items["sf_opal_glass"].slot == "planet_surface" and items["sf_opal_glass"].kind == "consumable"
    assert items["sf_opal_glass"].quantity == 2
    assert items["fx_ocean"].slot == "planet_effect"  # 기존 효과 아이템은 그대로


def _stars_with(monkeypatch, effects, surfaces):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_ROWS))
    monkeypatch.setattr(stars, "applied_effects", lambda user_id: dict(effects))
    monkeypatch.setattr(stars, "applied_surfaces", lambda user_id: dict(surfaces))
    monkeypatch.setattr(stars.ai_client, "diary_topics", lambda user_id, ids, allowed: None)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: [dict(_VISUAL)])
    return stars.list_stars(user_id="user-1")


def test_list_stars_attaches_surface_and_keeps_ai_result(monkeypatch):
    base = _stars_with(monkeypatch, {}, {})
    styled = _stars_with(
        monkeypatch,
        {"d1": {"item_id": "fx_ocean", "effect": "ocean"}},
        {"d1": {"item_id": "sf_opal_glass", "surface": "opal_glass"}},
    )

    assert "surface" not in base[0]  # 표면이 없으면 응답에 칸이 생기지 않는다(기존 응답 그대로)
    assert styled[0]["surface"] == "opal_glass" and styled[0]["surface_item_id"] == "sf_opal_glass"
    assert styled[0]["effect"] == "ocean"  # 표면과 효과는 따로 붙는다
    # 표면을 적용해도 감정 분석 결과·좌표·크기·색은 같다
    for key in ("planet", "x", "y", "z", "size", "color", "brightness"):
        assert styled[0][key] == base[0][key]


def test_migration_only_adds_surface_objects():
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "2026-11-21_planet_surfaces.sql").read_text(encoding="utf-8")
    body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--")).lower()
    # 기존 표·데이터를 바꾸거나 지우지 않는다
    for forbidden in ("drop ", "truncate", "alter table planet_effects", "alter table diaries", "alter table stars",
                      "update items", "update user_items", "delete from planet_effects", "delete from diaries"):
        assert forbidden not in body, forbidden
    # 새 아이템은 sf_ 로 시작하고 칸은 planet_surface (기존 fx_ 아이템과 겹치지 않음)
    assert body.count("'planet_surface'") >= 5
    assert "on conflict (id) do nothing" in body
    for style in ("opal_glass", "pastel_cloud", "pearl_silk", "crystal_prism", "aurora_ribbon"):
        assert f"'sf_{style}'" in body
