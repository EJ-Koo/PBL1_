from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    admin_jwt_secret: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

if not settings.admin_jwt_secret:
    raise RuntimeError("ADMIN_JWT_SECRET is not set")
