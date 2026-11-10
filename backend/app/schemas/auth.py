from pydantic import BaseModel, EmailStr


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    # 프론트(expo-auth-session)가 구글에서 받은 ID 토큰. 회원가입·로그인 공용.
    id_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str


class SignUpResponse(BaseModel):
    user_id: str
    access_token: str | None = None
    refresh_token: str | None = None
    email_confirmation_required: bool = False
