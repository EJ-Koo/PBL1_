from fastapi import APIRouter, Depends, Header, HTTPException

from app.db import new_auth_client, supabase
from app.dependencies import get_current_user_id
from app.schemas.auth import (
    GoogleAuthRequest,
    LoginRequest,
    SignUpRequest,
    SignUpResponse,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=SignUpResponse)
def signup(payload: SignUpRequest):
    client = new_auth_client()
    try:
        result = client.auth.sign_up(
            {"email": payload.email, "password": payload.password}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not result.user:
        raise HTTPException(status_code=400, detail="Sign up failed")

    if not result.session:
        return SignUpResponse(user_id=result.user.id, email_confirmation_required=True)

    return SignUpResponse(
        user_id=result.user.id,
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    client = new_auth_client()
    try:
        result = client.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return TokenResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        user_id=result.user.id,
    )


@router.post("/google", response_model=TokenResponse)
def google(payload: GoogleAuthRequest):
    # 구글 ID 토큰을 Supabase 세션으로 교환한다. 계정이 없으면 Supabase가 자동 생성하므로
    # 회원가입·로그인이 같은 경로로 처리된다. (Supabase 대시보드에서 Google provider 활성화 필요)
    client = new_auth_client()
    try:
        result = client.auth.sign_in_with_id_token(
            {"provider": "google", "token": payload.id_token}
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Google 로그인에 실패했습니다.")

    if not result.session or not result.user:
        raise HTTPException(status_code=401, detail="Google 로그인에 실패했습니다.")

    return TokenResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        user_id=result.user.id,
    )


@router.post("/logout")
def logout(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ")
    try:
        supabase.auth.admin.sign_out(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"status": "ok"}


@router.get("/me")
def me(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}
