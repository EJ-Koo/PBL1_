from pydantic import BaseModel


class ProfileCreate(BaseModel):
    user_id: str
    nickname: str


class Profile(ProfileCreate):
    id: str
