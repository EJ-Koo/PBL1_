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
    # 행성 외형(planet)은 AI 서비스가 있을 때만 붙는다. 없으면 null이고 프론트는 color만으로 그린다.
    contents = [(row.get("diaries") or {}).get("content") for row in rows]
    known = [i for i, c in enumerate(contents) if c]
    visuals = ai_client.planet_visuals([contents[i] for i in known]) if known else None
    if visuals:
        for i, visual in zip(known, visuals):
            rows[i]["planet"] = visual
    return rows
