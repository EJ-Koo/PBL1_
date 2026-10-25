from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str


class Group(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
    diary_ids: list[str] = []
