from pydantic import BaseModel


class DiaryCreate(BaseModel):
    user_id: str
    content: str


class Diary(DiaryCreate):
    id: str
    created_at: str
