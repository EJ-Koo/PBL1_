from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminTokenResponse(BaseModel):
    access_token: str
    admin_id: str
    username: str


class AdminUserOut(BaseModel):
    user_id: str
    email: str | None = None
    nickname: str | None = None
    created_at: str


class AdminDiaryOut(BaseModel):
    id: str
    user_id: str
    nickname: str | None = None
    content: str
    photo_url: str | None = None
    visibility: str
    created_at: str
    updated_at: str
