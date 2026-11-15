from typing import get_args

from fastapi import APIRouter, Depends

from app import ai_client
from app.config import settings
from app.db import supabase
from app.dependencies import get_current_user_id
from app.routers.shop import applied_effects
from app.routers.diaries import is_missing_column, mark_topic_column_missing, topic_column_ready
from app.schemas.diary import Topic
from app.schemas.star import Star

router = APIRouter(prefix="/stars", tags=["stars"])


_TOPICS = set(get_args(Topic))


def _select_star_rows(user_id: str) -> list[dict]:
    # [2026-11-13] diaries.topic 열(migrations/2026-11-13_diary_topic.sql)이 아직 없으면 예전 조회로 돌아간다.
    # 열 확인 상태는 diaries 라우터와 함께 쓴다(일정 시간마다 다시 확인).
    if topic_column_ready():
        try:
            return (
                supabase.table("stars")
                .select("*, diaries!inner(user_id, content, topic)")
                .eq("diaries.user_id", user_id)
                .execute()
                .data
            )
        except Exception as exc:
            if not is_missing_column(exc, "topic"):
                raise
            mark_topic_column_missing()
    return (
        supabase.table("stars")
        .select("*, diaries!inner(user_id, content)")
        .eq("diaries.user_id", user_id)
        .execute()
        .data
    )


def _attach_topics(user_id: str, rows: list[dict]) -> None:
    """별자리용 주제. DB(diaries.topic)가 먼저이고, 비어 있는 일기만 예전 AI 서비스 저장소에서 보충한다.
    AI 서비스가 꺼져 있어도 DB에 저장된 주제는 그대로 나간다. 좌표·외형과는 무관하다."""
    missing: list[str] = []
    for row in rows:
        topic = (row.get("diaries") or {}).get("topic")
        row["topic"] = topic if topic in _TOPICS else None
        if row["topic"] is None:
            missing.append(str(row["diary_id"]))
    if not missing or not settings.topic_ai_fallback:
        return
    legacy = ai_client.diary_topics(user_id, missing, _TOPICS)
    if legacy:
        for row in rows:
            if row["topic"] is None:
                row["topic"] = legacy.get(str(row["diary_id"]))


@router.get("", response_model=list[Star])
def list_stars(user_id: str = Depends(get_current_user_id)):
    rows = _select_star_rows(user_id)

    # [MODIFIED 2026-11-12] 특수 효과는 AI가 자동으로 고르지 않는다. 사용자가 상점에서 산 효과를 직접 적용한 행성만
    # effect 가 붙는다(planet_effects 표). 그래서 특수 행성 선택까지 계산하는 AI /design/batch 는 더 부르지 않고,
    # 감정 행성 외형만 계산하는 /analyze/batch 만 부른다. 행성 본체(색·무늬·크기·위치)는 예전과 같다.
    effects = applied_effects(user_id)
    for row in rows:
        mine = effects.get(str(row["diary_id"]))
        if mine:
            row["effect"] = mine["effect"]
            row["effect_item_id"] = mine["item_id"]

    # [2026-11-12] 별자리: 일기 주제(선택). [2026-11-13] DB 우선, 없으면 AI 서비스 저장소로 보충
    _attach_topics(user_id, rows)

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
