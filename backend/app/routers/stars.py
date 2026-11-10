from fastapi import APIRouter, Depends

from app import ai_client
from app.db import supabase
from app.dependencies import get_current_user_id
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
    # 행성 외형(planet)·행성 설계(design)는 AI 서비스가 있을 때만 붙는다. 없으면 null이고 프론트는 color만으로 그린다.
    contents = [(row.get("diaries") or {}).get("content") for row in rows]
    known = [i for i, c in enumerate(contents) if c]
    if not known:
        return rows
    designs = ai_client.planet_designs(user_id, [(rows[i]["diary_id"], contents[i]) for i in known])
    if designs:
        for i, d in zip(known, designs):
            if d:
                rows[i]["planet"] = d["visual"]
                # 크기는 기존 규칙(일기 분량 → stars.size) 값을 그대로 담는다
                rows[i]["design"] = {**d["design"], "emotionCore": {**d["design"]["emotionCore"], "size": rows[i].get("size")}}
        return rows
    # 행성 설계를 못 받으면(예: 예전 AI 서비스) 예전처럼 행성 외형만 붙인다
    visuals = ai_client.planet_visuals([contents[i] for i in known])
    if visuals:
        for i, visual in zip(known, visuals):
            rows[i]["planet"] = visual
    return rows
