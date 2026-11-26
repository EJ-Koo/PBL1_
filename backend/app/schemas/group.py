from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from app.schemas.diary import Topic


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=8)
    request_id: UUID | None = None

    @field_validator('name', mode='before')
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class GroupJoin(BaseModel):
    invite_code: str = Field(min_length=1, max_length=32)


class GroupMember(BaseModel):
    user_id: str
    nickname: str | None = None
    shared_day: str | None = None
    shared_today: bool | None = None
    shared_color: str | None = None


class Group(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
    invite_code: str
    diary_ids: list[str] = []
    members: list[GroupMember] = []


# 그룹 공유 우주: 멤버 전체가 이 그룹에 태그한 일기의 별 1개. 작성자 닉네임 포함.
class GroupStarEntry(BaseModel):
    diary_id: str
    author_id: str | None = None
    content: str
    created_at: str
    nickname: str | None = None
    topic: Topic | None = None
    x: float
    y: float
    z: float
    color: str
    size: float
    brightness: float
    planet: dict | None = None
    effect: str | None = None
    # [2026-11-21] 작성자가 적용한 표면 스타일. 없으면 null = 기본 표면(추가만, 기존 칸은 그대로)
    surface: str | None = None
