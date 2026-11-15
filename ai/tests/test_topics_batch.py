"""[ADDED 2026-11-12] 별자리용 주제 읽기(/topics/batch) 확인. 모델을 올리지 않고 임시 저장소로만 확인한다.

실행 (저장소 루트): .venv/Scripts/python -m pytest ai/tests/test_topics_batch.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from service import app as service  # noqa: E402
from src.special.topics import TopicStore  # noqa: E402

USER = "0b4e7c1a-1111-2222-3333-444455556666"
ALLOWED = {"travel", "relationship", "study_achievement", "rest_daily", "challenge_activity", "other"}


@pytest.fixture()
def store(tmp_path, monkeypatch):
    s = TopicStore(tmp_path, ALLOWED)
    monkeypatch.setattr(service, "_topics", s)
    return s


def test_returns_only_diaries_with_topics(store):
    store.set(USER, "d1", "travel")
    store.set(USER, "d3", "rest_daily")
    out = service.topics_batch(service.TopicBatchRequest(user_id=USER, diary_ids=["d1", "d2", "d3"]))
    assert out == {"topics": {"d1": "travel", "d3": "rest_daily"}}


def test_is_read_only(store, tmp_path):
    store.set(USER, "d1", "travel")
    path = tmp_path / "users" / USER / "topics.json"
    before = path.read_bytes()
    service.topics_batch(service.TopicBatchRequest(user_id=USER, diary_ids=["d1", "d9"]))
    assert path.read_bytes() == before


def test_unknown_user_is_empty_and_bad_user_is_422(store):
    out = service.topics_batch(service.TopicBatchRequest(user_id=USER, diary_ids=["d1"]))
    assert out == {"topics": {}}
    with pytest.raises(HTTPException) as err:
        service.topics_batch(service.TopicBatchRequest(user_id="not/a/valid/user", diary_ids=["d1"]))
    assert err.value.status_code == 422


def test_set_changes_and_clears_topic(store):
    """[2026-11-13] 일기 수정으로 주제가 바뀌거나 지워지면 저장소도 맞춘다."""
    store.set(USER, "d1", "travel")
    service.topics_set(service.TopicSetRequest(user_id=USER, diary_id="d1", topic="rest_daily"))
    assert store.get_many(USER, ["d1"]) == ["rest_daily"]
    service.topics_set(service.TopicSetRequest(user_id=USER, diary_id="d1", topic=None))
    assert store.get_many(USER, ["d1"]) == [None]
