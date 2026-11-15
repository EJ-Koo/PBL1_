from typing import Literal

from pydantic import BaseModel, Field
from app.schemas.quest import DailyQuestStatus

Visibility = Literal["public", "friends", "private"]
# 일기 주제(선택). 고르지 않아도 된다. [2026-11-13] diaries.topic 에 저장해 별자리 해금·표시에 쓴다
# (migrations/2026-11-13_diary_topic.sql 의 check 제약과 같은 값). AI 서비스에도 예전처럼 함께 보낸다.
Topic = Literal["travel", "relationship", "study_achievement", "rest_daily", "challenge_activity", "other"]

# [MODIFIED 2026-11-05] 일기 한 개에 사진 최대 5장 (fffju 일기 작성 화면 기준).
MAX_PHOTOS = 5


class DiaryCreate(BaseModel):
    content: str
    # 예전 클라이언트 호환용(사진 1장). 새 클라이언트는 photo_paths를 쓴다.
    photo_url: str | None = None
    # /uploads/photo 가 돌려준 저장 경로 목록 (순서대로, 최대 5장)
    photo_paths: list[str] = Field(default_factory=list, max_length=MAX_PHOTOS)
    visibility: Visibility = "private"
    group_ids: list[str] = []
    topic: Topic | None = None


class DiaryUpdate(BaseModel):
    content: str | None = None
    photo_url: str | None = None
    # 보내면 사진 목록 전체를 이 목록으로 바꾼다 (빠진 사진은 저장소에서도 지운다).
    photo_paths: list[str] | None = Field(default=None, max_length=MAX_PHOTOS)
    visibility: Visibility | None = None
    # [2026-11-13] 주제 바꾸기. 보내지 않으면 그대로, null 을 보내면 주제 없음으로 바꾼다.
    topic: Topic | None = None


class DiaryAuthor(BaseModel):
    nickname: str
    avatar_url: str | None = None


class Diary(BaseModel):
    id: str
    user_id: str
    content: str
    # 첫 번째 사진의 서명 URL (예전 화면·관리자 화면 호환용)
    photo_url: str | None = None
    # 모든 사진의 서명 URL (화면 표시용, 1시간 유효)
    photo_urls: list[str] = []
    # 모든 사진의 저장 경로 (수정할 때 기존 사진을 그대로 다시 보낼 때 사용)
    photo_paths: list[str] = []
    visibility: Visibility
    created_at: str
    updated_at: str
    # [2026-11-13] 일기 주제(선택). diaries.topic 열이 아직 없거나 고르지 않았으면 None.
    topic: Topic | None = None
    quest_result: DailyQuestStatus | None = None
    author_profile: DiaryAuthor | None = None


class RelatedDiary(BaseModel):
    diary_id: str
    similarity: float  # 코사인 유사도(확률 아님)
    content: str
    created_at: str
