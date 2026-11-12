from fastapi import APIRouter, Depends

from app import ai_client
from app.db import supabase
from app.dependencies import get_current_user_id
from app.routers.shop import applied_effects
from app.schemas.star import Star

router = APIRouter(prefix="/stars", tags=["stars"])


@router.get("", response_model=list[Star])
def list_stars(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("stars")
        .select("*, diaries!inner(user_id, content)")
        .eq("diaries.user_id", user_id)
        .execute()
    )
    rows = result.data

    # [MODIFIED 2026-11-12] 특수 효과는 AI가 자동으로 고르지 않는다. 사용자가 상점에서 산 효과를 직접 적용한 행성만
    # effect 가 붙는다(planet_effects 표). 그래서 특수 행성 선택까지 계산하는 AI /design/batch 는 더 부르지 않고,
    # 감정 행성 외형만 계산하는 /analyze/batch 만 부른다. 행성 본체(색·무늬·크기·위치)는 예전과 같다.
    effects = applied_effects(user_id)
    for row in rows:
        mine = effects.get(str(row["diary_id"]))
        if mine:
            row["effect"] = mine["effect"]
            row["effect_item_id"] = mine["item_id"]

    # 행성 외형(planet)은 AI 서비스가 있을 때만 붙는다. 없으면 null이고 프론트는 color만으로 그린다.
    contents = [(row.get("diaries") or {}).get("content") for row in rows]
    known = [i for i, c in enumerate(contents) if c]
    if not known:
        return rows
    visuals = ai_client.planet_visuals([contents[i] for i in known])
    if visuals:
        for i, visual in zip(known, visuals):
            rows[i]["planet"] = visual
    return rows
