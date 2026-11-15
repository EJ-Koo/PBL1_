"""[ADDED 2026-11-12] 별자리: 별 목록에 일기 주제(선택)를 붙이는 부분.
주제는 DB가 아니라 AI 서비스에 저장된 값을 읽기만 한다. 기존 필드(좌표·색·크기·외형·효과)는 그대로여야 한다."""
from app import ai_client
from app.routers import stars

from tests.test_ai_client import _FakeResponse, _use_ai_service
from tests.test_special_planet import _VISUAL, _StarsDB, _no_applied_effects

_ALLOWED = {"travel", "relationship", "study_achievement", "rest_daily", "challenge_activity", "other"}

_TWO_ROWS = [
    {"id": "s1", "diary_id": "d1", "x": 1.5, "y": -2.0, "z": 0.25, "color": "#FFFFFF", "size": 0.7, "brightness": 1,
     "diaries": {"user_id": "user-1", "content": "바다 여행"}},
    {"id": "s2", "diary_id": "d2", "x": 3.0, "y": 4.0, "z": -1.0, "color": "#FFFFFF", "size": 0.7, "brightness": 1,
     "diaries": {"user_id": "user-1", "content": "그냥 하루"}},
]


def test_diary_topics_reads_ai_store_and_drops_unknown_values(monkeypatch):
    _use_ai_service(monkeypatch)
    sent = []

    def fake_post(url, json, headers, timeout):
        sent.append((url, json))
        return _FakeResponse({"topics": {"d1": "travel", "d3": "not-a-topic"}})

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)
    out = ai_client.diary_topics("user-1", ["d1", "d2", "d3"], _ALLOWED)

    assert out == {"d1": "travel"}
    assert sent[0][0].endswith("/topics/batch")
    assert sent[0][1] == {"user_id": "user-1", "diary_ids": ["d1", "d2", "d3"]}


def test_diary_topics_returns_none_without_ai_or_on_failure(monkeypatch):
    monkeypatch.setattr(ai_client.settings, "ai_service_url", "")
    assert ai_client.diary_topics("user-1", ["d1"], _ALLOWED) is None

    _use_ai_service(monkeypatch)

    def boom(*_a, **_k):
        raise ai_client.httpx.ConnectError("down")

    monkeypatch.setattr(ai_client.httpx, "post", boom)
    assert ai_client.diary_topics("user-1", ["d1"], _ALLOWED) is None


def test_list_stars_attaches_topic_without_touching_other_fields(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_TWO_ROWS))
    _no_applied_effects(monkeypatch, {"d1": {"item_id": "fx_ocean", "effect": "ocean"}})
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: [_VISUAL, _VISUAL])
    # _no_applied_effects 의 기본 스텁(주제 없음)을 덮어쓴다
    monkeypatch.setattr(stars.ai_client, "diary_topics", lambda user_id, ids, allowed: {"d1": "travel"})

    rows = stars.list_stars(user_id="user-1")

    assert rows[0]["topic"] == "travel"
    assert rows[1]["topic"] is None  # 주제를 고르지 않은 일기는 일반 우주에 그대로
    # 좌표(bge-m3)·색·크기·외형·효과는 바뀌지 않는다
    assert (rows[0]["x"], rows[0]["y"], rows[0]["z"]) == (1.5, -2.0, 0.25)
    assert (rows[1]["x"], rows[1]["y"], rows[1]["z"]) == (3.0, 4.0, -1.0)
    assert rows[0]["effect"] == "ocean" and rows[0]["planet"] == _VISUAL
    assert rows[0]["size"] == 0.7 and rows[0]["color"] == "#FFFFFF"


def test_list_stars_without_topics_keeps_old_response(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_TWO_ROWS))
    _no_applied_effects(monkeypatch)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: None)
    monkeypatch.setattr(stars.ai_client, "diary_topics", lambda user_id, ids, allowed: None)

    rows = stars.list_stars(user_id="user-1")
    assert all(r["topic"] is None for r in rows)  # 응답은 예전과 같다(Star.topic 기본값 None)


# ---------------------------------------------------------------- [2026-11-13] diaries.topic(DB) 우선
def _rows_with_db_topics(*topics):
    rows = []
    for i, topic in enumerate(topics):
        diary = {"user_id": "user-1", "content": f"일기 {i}"}
        if topic is not ...:
            diary["topic"] = topic
        rows.append({"id": f"s{i}", "diary_id": f"d{i}", "x": i, "y": 0, "z": 0, "color": "#FFFFFF", "size": 0.7,
                     "brightness": 1, "diaries": diary})
    return rows


def test_db_topic_wins_and_ai_fills_only_missing(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_rows_with_db_topics("travel", None, "rest_daily")))
    _no_applied_effects(monkeypatch)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: None)
    asked = []

    def legacy(user_id, ids, allowed):
        asked.append(list(ids))
        return {"d0": "other", "d1": "relationship"}  # d0 은 DB 값이 있으므로 무시돼야 한다

    monkeypatch.setattr(stars.ai_client, "diary_topics", legacy)
    rows = stars.list_stars(user_id="user-1")
    assert [r["topic"] for r in rows] == ["travel", "relationship", "rest_daily"]
    assert asked == [["d1"]]  # DB 에 주제가 없는 일기만 AI 서비스에 물어본다


def test_db_topics_are_returned_when_ai_service_is_down(monkeypatch):
    monkeypatch.setattr(stars, "supabase", _StarsDB(_rows_with_db_topics("travel", "travel", None)))
    _no_applied_effects(monkeypatch)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: None)
    monkeypatch.setattr(stars.ai_client, "diary_topics", lambda *a: None)  # AI 서비스 중단(None)
    rows = stars.list_stars(user_id="user-1")
    assert [r["topic"] for r in rows] == ["travel", "travel", None]


def test_no_ai_call_when_every_diary_has_db_topic_or_fallback_disabled(monkeypatch):
    def must_not_call(*_a):
        raise AssertionError("AI 서비스를 부르면 안 된다")

    _no_applied_effects(monkeypatch)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: None)
    monkeypatch.setattr(stars.ai_client, "diary_topics", must_not_call)
    monkeypatch.setattr(stars, "supabase", _StarsDB(_rows_with_db_topics("travel", "other")))
    assert [r["topic"] for r in stars.list_stars(user_id="user-1")] == ["travel", "other"]

    monkeypatch.setattr(stars.settings, "topic_ai_fallback", False)
    monkeypatch.setattr(stars, "supabase", _StarsDB(_rows_with_db_topics(None, "other")))
    assert [r["topic"] for r in stars.list_stars(user_id="user-1")] == [None, "other"]


class _NoTopicColumnDB(_StarsDB):
    """migrations/2026-11-13_diary_topic.sql 을 아직 실행하지 않은 DB: topic 을 고르면 PostgREST 오류."""

    def __init__(self, rows):
        super().__init__(rows)
        self.selects = []

    def table(self, name):
        outer = self
        inner = super().table(name)

        class T:
            def select(self, cols, *a, **k):
                outer.selects.append(cols)
                if "topic" in cols:
                    raise Exception("{'code': '42703', 'message': 'column diaries_1.topic does not exist'}")
                return inner.select(cols)

        return T()


def test_works_before_migration_without_topic_column(monkeypatch):
    from app.routers import diaries as diaries_router

    monkeypatch.setattr(diaries_router, "_topic_column", True)
    db = _NoTopicColumnDB(_rows_with_db_topics(..., ...))
    monkeypatch.setattr(stars, "supabase", db)
    _no_applied_effects(monkeypatch)
    monkeypatch.setattr(stars.ai_client, "planet_visuals", lambda contents: None)
    monkeypatch.setattr(stars.ai_client, "diary_topics", lambda user_id, ids, allowed: {"d1": "travel"})
    rows = stars.list_stars(user_id="user-1")
    assert [r["topic"] for r in rows] == [None, "travel"]  # 예전처럼 AI 저장소에서
    assert db.selects == ["*, diaries!inner(user_id, content, topic)", "*, diaries!inner(user_id, content)"]
    stars.list_stars(user_id="user-1")
    assert db.selects[-1] == "*, diaries!inner(user_id, content)"  # 한 번 확인한 뒤에는 바로 예전 조회
    # 마이그레이션을 실행하면(재확인 시간이 지나면) 서버를 다시 띄우지 않아도 열을 다시 쓴다
    monkeypatch.setattr(diaries_router, "_topic_column_missing_at", -1e9)
    n = len(db.selects)
    stars.list_stars(user_id="user-1")
    assert db.selects[n] == "*, diaries!inner(user_id, content, topic)"
    monkeypatch.setattr(diaries_router, "_topic_column", True)


def test_missing_column_detection_does_not_swallow_constraint_errors():
    from app.routers.diaries import is_missing_column

    assert is_missing_column(Exception("Could not find the 'topic' column of 'diaries' in the schema cache"), "topic")
    assert is_missing_column(Exception("column diaries.topic does not exist"), "topic")
    assert not is_missing_column(Exception('violates check constraint "diaries_topic_check"'), "topic")


def test_set_diary_topic_sends_null_and_ignores_failures(monkeypatch):
    _use_ai_service(monkeypatch)
    sent = []
    monkeypatch.setattr(ai_client.httpx, "post", lambda url, json, headers, timeout: sent.append((url, json)) or _FakeResponse({"ok": True}))
    ai_client.set_diary_topic("user-1", "d1", None)
    assert sent == [("http://ai.local/topics/set", {"user_id": "user-1", "diary_id": "d1", "topic": None})]

    def boom(*_a, **_k):
        raise ai_client.httpx.ConnectError("down")

    monkeypatch.setattr(ai_client.httpx, "post", boom)
    ai_client.set_diary_topic("user-1", "d1", "travel")  # 예외 없이 끝난다
