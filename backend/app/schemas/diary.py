from typing import Literal

from pydantic import BaseModel

Visibility = Literal["public", "friends", "private"]


class DiaryCreate(BaseModel):
    content: str
    photo_url: str | None = None
    visibility: Visibility = "private"


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
