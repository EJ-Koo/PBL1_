from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class GroupJoin(BaseModel):
    invite_code: str = Field(min_length=1, max_length=32)


class GroupMember(BaseModel):
    user_id: str
    nickname: str | None = None


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
    content: str
    created_at: str
    nickname: str | None = None
    x: float
    y: float
    z: float
    color: str
    size: float
    brightness: float
    planet: dict | None = None
    effect: str | None = None
