"""일기 주제(선택)·행성 설계(특수 행성) 연동. 기존 동작(주제 없음, AI 없음)이 그대로인지도 확인한다."""
import pytest
from pydantic import ValidationError

from app import ai_client
from app.routers import diaries, stars
from app.schemas.diary import DiaryCreate

from tests.test_ai_client import _FakeResponse, _use_ai_service
from tests.test_diaries import _FakeSupabase


@pytest.fixture(autouse=True)
def _clear_caches():
    ai_client._DESIGN_CACHE.clear()
    ai_client._VISUAL_CACHE.clear()
    yield
    ai_client._DESIGN_CACHE.clear()
    ai_client._VISUAL_CACHE.clear()


# ---------------------------------------------------------------- 주제 입력
def test_topic_is_optional_and_validated():
    assert DiaryCreate(content="hello").topic is None
    assert DiaryCreate(content="hello", topic="travel").topic == "travel"
    with pytest.raises(ValidationError):
        DiaryCreate(content="hello", topic="not-a-topic")


def test_create_diary_passes_topic_to_ai(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)
    calls = {}

    def fake_place(user_id, diary_id, content, topic=None):
        calls.update(topic=topic)
        return {"x": 1.0, "y": 2.0, "z": 3.0}

    monkeypatch.setattr(diaries.ai_client, "place_diary", fake_place)
    diaries.create_diary(DiaryCreate(content="바다에 다녀왔다", topic="travel"), user_id="user-1")

    assert calls == {"topic": "travel"}
    # 주제는 DB(diaries·stars)에 넣지 않는다(스키마 변경 없음)
    assert "topic" not in fake.star_inserts[0]


def test_place_diary_sends_topic_only_when_selected(monkeypatch):
    _use_ai_service(monkeypatch)
    sent = []

    def fake_post(url, json, headers, timeout):
        sent.append(json)
        return _FakeResponse({"star": {"x": 0, "y": 0, "z": 0}})

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)
    ai_client.place_diary("user-1", "d1", "글")
    ai_client.place_diary("user-1", "d2", "글", topic="rest_daily")

    assert "topic" not in sent[0]
    assert sent[1]["topic"] == "rest_daily"


# ---------------------------------------------------------------- 행성 설계 조회
_VISUAL = {"base_color": "#FFC93C", "pattern": "bands"}
_DESIGN = {"planetType": "special", "specialType": "ocean",
           "emotionCore": {"primaryEmotion": "joy", "colors": ["#FFC93C"], "pattern": "bands", "size": None},
           "specialEffects": {"waterAura": True}, "selection": {"reason": "..."}}


def test_planet_designs_returns_visual_and_design_and_caches(monkeypatch):
    _use_ai_service(monkeypatch)
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append((url, json))
        return _FakeResponse({"results": [{"diary_id": it["diary_id"], "visual": _VISUAL, "star": {}, "design": _DESIGN}
                                          for it in json["items"]]})

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)
    out = ai_client.planet_designs("user-1", [("d1", "a"), ("d2", "b")])
    assert out == [{"visual": _VISUAL, "design": _DESIGN}] * 2
    assert calls[0][0] == "http://ai.local/design/batch"
    assert calls[0][1]["user_id"] == "user-1"

    ai_client.planet_designs("user-1", [("d1", "a")])
    assert len(calls) == 1  # 같은 일기·같은 내용은 다시 묻지 않는다


def test_planet_designs_none_without_ai_or_on_error(monkeypatch):
    monkeypatch.setattr(ai_client.settings, "ai_service_url", "")
    assert ai_client.planet_designs("user-1", [("d1", "a")]) is None

    _use_ai_service(monkeypatch)
    monkeypatch.setattr(ai_client.httpx, "post", lambda *a, **k: _FakeResponse({}, status_code=404))
    assert ai_client.planet_designs("user-1", [("d1", "a")]) is None


class _StarsTable:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        class R:
            data = [dict(r, diaries=dict(r["diaries"])) for r in self.rows]
        return R()


class _StarsDB:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _StarsTable(self._rows)


_ROWS = [{"id": "s1", "diary_id": "d1", "x": 0, "y": 0, "z": 0, "color": "#FFFFFF", "size": 0.7, "brightness": 1,
          "diaries": {"user_id": "user-1", "content": "바다"}}]


def test_list_stars_attaches_design_with_existing_size(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_ROWS))
    monkeypatch.setattr(stars.ai_client, "planet_designs", lambda uid, items: [{"visual": _VISUAL, "design": _DESIGN}])

    rows = stars.list_stars(user_id="user-1")

    assert rows[0]["planet"] == _VISUAL
    assert rows[0]["design"]["specialType"] == "ocean"
    assert rows[0]["design"]["emotionCore"]["size"] == 0.7  # 크기 = 기존 규칙(일기 분량)으로 저장된 값
    assert rows[0]["size"] == 0.7 and rows[0]["color"] == "#FFFFFF"  # 기존 필드는 그대로


def test_list_stars_falls_back_to_visual_only(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_ROWS))
    monkeypatch.setattr(stars.ai_client, "planet_designs", lambda uid, items: None)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: [_VISUAL])

    rows = stars.list_stars(user_id="user-1")
    assert rows[0]["planet"] == _VISUAL and "design" not in rows[0]


def test_list_stars_without_ai_has_no_planet(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_ROWS))
    monkeypatch.setattr(ai_client.settings, "ai_service_url", "")

    rows = stars.list_stars(user_id="user-1")
    assert "planet" not in rows[0] and "design" not in rows[0]
