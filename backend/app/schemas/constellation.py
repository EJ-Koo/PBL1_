"""[NEW FILE 2026-11-15] 나만의 별자리(Level 4) API 스키마."""
from typing import Literal

from pydantic import BaseModel

from app.schemas.diary import Topic

PersonalStatus = Literal["pending", "ready", "failed"]


class PersonalConstellationCreate(BaseModel):
    topic: Topic
    # 일기 내용(날짜·본문)이 외부 AI(OpenAI)로 전송된다는 안내에 동의했는지. true 가 아니면 생성하지 않는다.
    consent: bool = False


class PersonalConstellation(BaseModel):
    topic: Topic
    status: PersonalStatus
    # 실제 서버 진행 단계: queued → analyzing(일기 분석) → designing(모양 그리기) → validating(좌표 생성·검증) → done | failed
    stage: str
    name: str | None = None
    concept: str | None = None
    shape_label: str | None = None
    description: str | None = None
    reason: str | None = None
    keywords: list[str] = []
    analysis: dict = {}
    # 정규화 좌표(긴 쪽 반폭 1, y 위) 30개와 연결선. 행성 원래 좌표(stars)와는 별개이며 화면 표시에만 쓴다.
    points: list[list[float]] | None = None
    connections: list[list[int]] | None = None
    # points[i] 에 놓일 행성(일기) id. 생성할 때의 오래된 순 30개.
    planet_ids: list[str] = []
    required_planets: int = 30
    source_diary_count: int | None = None
    # llm = LLM 이 그린 모양, catalog = LLM 모양이 검증을 통과하지 못해 콘셉트와 가장 가까운 기본 도안으로 대체
    shape_source: str | None = None
    created_at: str | None = None
    completed_at: str | None = None
    attempts_left: int = 0
    error_code: str | None = None
    error_message: str | None = None
