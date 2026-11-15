from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    admin_jwt_secret: str = ""
    # AI 추론 서비스(ai/service). 비워 두면 AI 없이 기본 색·밝기로 별을 만든다.
    ai_service_url: str = ""
    ai_service_token: str = ""
    ai_service_timeout: float = 5.0
    # [2026-11-13] 별자리: diaries.topic 이 비어 있는 일기만 예전 AI 서비스 주제 저장소(JSON)에서 보충한다.
    # 주제를 DB로 옮긴(backfill) 뒤에는 TOPIC_AI_FALLBACK=false 로 꺼도 된다.
    topic_ai_fallback: bool = True
    # diaries.topic 열이 없다고 확인한 뒤 다시 확인하기까지의 시간(초). 마이그레이션 후 서버 재시작 없이 열을 쓰게 한다.
    topic_column_recheck_seconds: float = 300.0

    # [2026-11-15] 나만의 별자리(Level 4): LLM(OpenAI)이 같은 주제 일기 30개 이상을 읽고 별자리 콘셉트·모양을 만든다.
    # 키는 이 .env(깃에 올라가지 않음)에만 둔다. 비워 두면 기능이 꺼지고(503) 나머지 기능은 그대로 동작한다.
    openai_api_key: str = ""
    llm_model: str = "gpt-5-mini"
    # 테스트용 가짜 서버로 바꿀 때만 쓴다(기본: OpenAI).
    llm_base_url: str = "https://api.openai.com/v1"
    # 추론 모델(gpt-5 계열)만 쓰는 값. 추론을 지원하지 않는 모델이면 비워 둔다.
    llm_reasoning_effort: str = "low"
    llm_timeout: float = 90.0
    llm_max_retries: int = 2
    llm_max_output_tokens: int = 8000
    # 비용 추적용 단가(USD / 100만 토큰). 0이면 토큰 수만 기록한다.
    llm_price_input_per_mtok: float = 0.0
    llm_price_output_per_mtok: float = 0.0
    # 개인화 별자리 생성 규칙
    personal_constellation_threshold: int = 30
    personal_constellation_max_attempts: int = 3
    # 생성 중(pending) 상태가 이 시간(초) 넘게 바뀌지 않으면 멈춘 것으로 보고 다시 시도할 수 있게 한다.
    personal_constellation_stale_seconds: float = 300.0

    class Config:
        env_file = ".env"


settings = Settings()

if not settings.admin_jwt_secret:
    raise RuntimeError("ADMIN_JWT_SECRET is not set")
