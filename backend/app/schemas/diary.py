from typing import Literal

from pydantic import BaseModel, Field

Visibility = Literal["public", "friends", "private"]

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


class DiaryUpdate(BaseModel):
    content: str | None = None
    photo_url: str | None = None
    # 보내면 사진 목록 전체를 이 목록으로 바꾼다 (빠진 사진은 저장소에서도 지운다).
    photo_paths: list[str] | None = Field(default=None, max_length=MAX_PHOTOS)
    visibility: Visibility | None = None


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
