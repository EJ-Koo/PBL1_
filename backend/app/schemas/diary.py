from pydantic import BaseModel


class DiaryCreate(BaseModel):
    content: str


class Diary(BaseModel):
    id: str
    user_id: str
    content: str
    created_at: str
