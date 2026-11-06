from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    admin_jwt_secret: str = ""
    # AI 추론 서비스(ai/service). 비워 두면 AI 없이 기본 색·밝기로 별을 만든다.
    ai_service_url: str = ""
    ai_service_token: str = ""
    ai_service_timeout: float = 5.0

    class Config:
        env_file = ".env"


settings = Settings()

if not settings.admin_jwt_secret:
    raise RuntimeError("ADMIN_JWT_SECRET is not set")
