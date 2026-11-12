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
