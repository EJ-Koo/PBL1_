import pytest
from fastapi import HTTPException
from app.routers import diaries


@pytest.fixture(autouse=True)
def isolate_diary_quest_side_effect(monkeypatch):
    """기존 일기 단위 테스트는 별도 RPC를 호출하지 않음. 통합 테스트가 명시적으로 재정의."""
    def unavailable(*_args, **_kwargs):
        raise HTTPException(status_code=503, detail='Quest RPC isolated in diary unit tests')
    monkeypatch.setattr(diaries, 'sync_daily_quest', unavailable)
