from typing import Literal

from pydantic import BaseModel

Visibility = Literal["public", "friends", "private"]
# 일기 주제(선택). 고르지 않아도 된다. AI가 특수 행성을 고를 때 보조 정보로만 쓴다(ai/configs/special_planet.json).
Topic = Literal["travel", "relationship", "study_achievement", "rest_daily", "challenge_activity", "other"]


class DiaryCreate(BaseModel):
    content: str
    photo_url: str | None = None
    visibility: Visibility = "private"
    group_ids: list[str] = []
    topic: Topic | None = None


class DiaryUpdate(BaseModel):
    content: str | None = None
    photo_url: str | None = None
    visibility: Visibility | None = None


class Diary(BaseModel):
    id: str
    user_id: str
    content: str
    photo_url: str | None = None
    visibility: Visibility
    created_at: str
    updated_at: str


class RelatedDiary(BaseModel):
    diary_id: str
    similarity: float  # 코사인 유사도(확률 아님)
    content: str
    created_at: str
