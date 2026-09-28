from pydantic import BaseModel


class ProfileCreate(BaseModel):
    nickname: str


class Profile(BaseModel):
    id: str
    user_id: str
    nickname: str
    created_at: str
