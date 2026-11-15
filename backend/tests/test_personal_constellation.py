"""[ADDED 2026-11-15] 나만의 별자리(Level 4, LLM 개인화 생성).

실제 OpenAI 를 부르지 않는다: llm_client.chat_json 을 가짜 응답으로 바꾸고, DB 는 메모리 가짜 표를 쓴다.
실행 (backend 폴더): .venv/Scripts/python -m pytest tests/test_personal_constellation.py
"""
from __future__ import annotations

import copy
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import BackgroundTasks, HTTPException, Response
from postgrest.exceptions import APIError

from app import constellation_llm as cl
from app import constellation_shape as cs
from app import llm_client
from app.routers import constellations as router
from app.schemas.constellation import PersonalConstellationCreate

USER_A = "aaaaaaaa-0000-4000-8000-000000000001"
USER_B = "bbbbbbbb-0000-4000-8000-000000000002"
SECRET_KEY = "sk-test-SECRET-should-never-be-logged"


# ---------------------------------------------------------------------------- 가짜 DB
class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db: "FakeDB", table: str):
        self.db, self.table = db, table
        self.op, self.payload, self.filters = "select", None, []

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def eq(self, key, value):
        self.filters.append(lambda r: str(r.get(key)) == str(value))
        return self

    def in_(self, key, values):
        allowed = {str(v) for v in values}
        self.filters.append(lambda r: str(r.get(key)) in allowed)
        return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        match = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "select":
            return _Res(copy.deepcopy(match))
        if self.op == "insert":
            p = self.payload
            if self.table == router.TABLE and any(r["user_id"] == p["user_id"] and r["topic"] == p["topic"] for r in rows):
                raise APIError({"code": "23505", "message": "duplicate key"})
            row = {
                "id": str(uuid.uuid4()), "created_at": router._now(), "keywords": [], "analysis": {}, "planet_ids": [],
                "usage": {}, "points": None, "connections": None,
            } | copy.deepcopy(p)
            rows.append(row)
            return _Res([copy.deepcopy(row)])
        for r in match:
            r.update(copy.deepcopy(self.payload))
        return _Res(copy.deepcopy(match))


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}

    def table(self, name):
        return _Query(self, name)


def _diary(user, i, topic, text=None, day0=datetime(2026, 1, 1, tzinfo=timezone.utc)):
    did = str(uuid.UUID(int=(hash((user, i)) & ((1 << 120) - 1))))
    return {
        "id": did, "user_id": user, "topic": topic, "content": text or f"바다 여행 {i}일째, 파도를 봤다",
        "created_at": (day0 + timedelta(days=i)).isoformat(),
    }


def _seed(db: FakeDB, user: str, topic: str | None, n: int, start: int = 0, text=None):
    ds = [_diary(user, start + i, topic, text) for i in range(n)]
    db.tables.setdefault("diaries", []).extend(ds)
    db.tables.setdefault("stars", []).extend(
        {"diary_id": d["id"], "x": math.cos(k), "y": math.sin(k), "z": 0.1 * k} for k, d in enumerate(ds)
    )
    return ds


# ---------------------------------------------------------------------------- 가짜 LLM
CONCEPT = {
    "analysis": {"activities": ["해변 산책", "스노클링"], "places": ["바다", "해변"], "interests": ["파도"],
                 "experiences": ["친구와 바다 여행"]},
    "concept": "whale",
    "shape_label": "고래",
    "name": "푸른 고래 별자리",
    "description": "당신의 여행 기록에는 바다와 관련된 소중한 순간들이 많이 담겨 있습니다.",
    "reason": "바다·해변·파도가 반복해서 나와 바다를 대표하는 고래를 골랐습니다.",
    "keywords": ["바다", "해변", "여행", "파도"],
    "visual_features": ["머리", "꼬리 지느러미", "가슴 지느러미", "물줄기"],
    "closest_shape": "whale",
}
SHAPE = {"view": "side view", "strokes": cs.CATALOG["whale"]["strokes"], "keypoints": cs.CATALOG["whale"]["keypoints"]}
BAD_SHAPE = {"view": "x", "strokes": [{"part": "선", "role": "outline", "closed": False, "d": "M 0 0 L 100 0"}],
             "keypoints": []}


class FakeLLM:
    def __init__(self, shapes=None, fail: Exception | None = None):
        self.calls: list[str] = []
        self.users: list[str] = []
        self.shapes = list(shapes or [SHAPE])
        self.fail = fail

    def __call__(self, *, purpose, system, user, schema_name, schema, usage, max_output_tokens=None, log_tag=""):
        self.calls.append(purpose)
        self.users.append(user)
        usage.calls += 1
        usage.add({"prompt_tokens": 1000, "completion_tokens": 200})
        if self.fail:
            raise self.fail
        if purpose == "constellation_themes":
            return {"activities": ["해변 산책"], "places": ["바다"], "interests": ["파도"], "experiences": ["여행"],
                    "visual_objects": ["고래"]}
        if purpose == "constellation_concept":
            return copy.deepcopy(CONCEPT)
        return copy.deepcopy(self.shapes.pop(0) if len(self.shapes) > 1 else self.shapes[0])


@pytest.fixture()
def env(monkeypatch):
    db = FakeDB()
    llm = FakeLLM()
    monkeypatch.setattr(router, "supabase", db)
    monkeypatch.setattr(router.settings, "openai_api_key", SECRET_KEY)
    monkeypatch.setattr(router.settings, "personal_constellation_threshold", 30)
    monkeypatch.setattr(router.settings, "personal_constellation_max_attempts", 3)
    monkeypatch.setattr(router.ai_client, "diary_topics", lambda *a, **k: None)
    monkeypatch.setattr(cl.llm_client, "chat_json", llm)
    return db, llm


def _post(user, topic="travel", consent=True):
    bg = BackgroundTasks()
    res = Response()
    out = router.create_personal(PersonalConstellationCreate(topic=topic, consent=consent), bg, res, user_id=user)
    return out, bg, res


def _run(bg: BackgroundTasks):
    for task in bg.tasks:
        task.func(*task.args, **task.kwargs)


def _row(db, user, topic="travel"):
    return next(r for r in db.tables.get(router.TABLE, []) if r["user_id"] == user and r["topic"] == topic)


# ---------------------------------------------------------------------------- 해금 조건
def test_29_diaries_cannot_generate(env):
    db, llm = env
    _seed(db, USER_A, "travel", 29)
    with pytest.raises(HTTPException) as err:
        _post(USER_A)
    assert err.value.status_code == 409
    assert err.value.detail["code"] == "not_enough" and err.value.detail["count"] == 29
    assert llm.calls == [] and not db.tables.get(router.TABLE)


def test_other_topic_and_untopiced_diaries_are_not_counted(env):
    db, llm = env
    _seed(db, USER_A, "travel", 29)
    _seed(db, USER_A, "relationship", 30, start=100)
    _seed(db, USER_A, None, 10, start=200)
    with pytest.raises(HTTPException) as err:
        _post(USER_A, "travel")
    assert err.value.detail["count"] == 29
    assert llm.calls == []


def test_30_diaries_generate_once_and_save(env):
    db, llm = env
    diaries = _seed(db, USER_A, "travel", 31)
    out, bg, res = _post(USER_A)
    assert res.status_code == 202 and out["status"] == "pending" and out["stage"] == "queued"
    assert llm.calls == []  # 응답 후 백그라운드에서만 호출
    _run(bg)
    assert llm.calls == ["constellation_concept", "constellation_shape"]
    row = _row(db, USER_A)
    assert row["status"] == "ready" and row["stage"] == "done" and row["shape_source"] == "llm"
    assert len(row["points"]) == 30 and cs.validate_constellation(row["points"], row["connections"]) == []
    oldest = sorted(diaries, key=lambda d: (d["created_at"], d["id"]))[:30]
    assert row["planet_ids"] == [d["id"] for d in oldest]  # 생성 당시 오래된 순 30개
    assert row["source_diary_count"] == 31
    assert row["usage"]["calls"] == 2 and row["usage"]["input_tokens"] == 2000
    assert row["name"] == "푸른 고래 별자리"


def test_second_view_uses_saved_result_without_llm(env):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    _, bg, _ = _post(USER_A)
    _run(bg)
    n = len(llm.calls)
    listed = router.list_personal(user_id=USER_A)
    again, bg2, res = _post(USER_A)
    assert len(llm.calls) == n and bg2.tasks == [] and res.status_code == 200
    assert listed[0]["points"] == again["points"] and listed[0]["status"] == "ready"


def test_duplicate_clicks_while_pending_do_not_start_another_run(env):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    _, bg1, _ = _post(USER_A)
    second, bg2, res2 = _post(USER_A)
    third, bg3, _ = _post(USER_A, consent=False)  # 네트워크 재시도 등
    assert len(bg1.tasks) == 1 and bg2.tasks == [] and bg3.tasks == []
    assert second["status"] == "pending" and res2.status_code == 202
    assert len(db.tables[router.TABLE]) == 1
    _run(bg1)
    assert llm.calls.count("constellation_concept") == 1


def test_concurrent_insert_conflict_returns_existing_row(env, monkeypatch):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    real_get = router._get
    calls = {"n": 0}

    def get_racing(user_id, topic):  # 첫 조회 때는 비어 있었지만 그 사이 다른 요청이 행을 만들었다
        calls["n"] += 1
        if calls["n"] == 1:
            db.tables.setdefault(router.TABLE, []).append({
                "id": "other", "user_id": user_id, "topic": topic, "status": "pending", "stage": "analyzing",
                "run_id": "r0", "attempts": 1, "updated_at": router._now(),
            })
            return None
        return real_get(user_id, topic)

    monkeypatch.setattr(router, "_get", get_racing)
    out, bg, _ = _post(USER_A)
    assert bg.tasks == [] and out["stage"] == "analyzing"
    assert len(db.tables[router.TABLE]) == 1


def test_llm_error_marks_failed_then_retry_succeeds(env, monkeypatch):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    llm.fail = llm_client.LLMError("server", "HTTP 503", retryable=True)
    _, bg, _ = _post(USER_A)
    _run(bg)
    failed = router.list_personal(user_id=USER_A)[0]
    assert failed["status"] == "failed" and failed["error_code"] == "server"
    assert failed["error_message"] and failed["points"] is None and failed["attempts_left"] == 2
    llm.fail = None
    out, bg2, _ = _post(USER_A)
    assert out["status"] == "pending" and len(bg2.tasks) == 1
    _run(bg2)
    assert _row(db, USER_A)["status"] == "ready" and _row(db, USER_A)["attempts"] == 2


def test_invalid_shape_twice_falls_back_to_catalog(env):
    db, llm = env
    llm.shapes = [BAD_SHAPE, BAD_SHAPE]
    _seed(db, USER_A, "travel", 30)
    _, bg, _ = _post(USER_A)
    _run(bg)
    row = _row(db, USER_A)
    assert llm.calls == ["constellation_concept", "constellation_shape", "constellation_shape"]
    assert row["status"] == "ready" and row["shape_source"] == "catalog"
    assert row["analysis"]["stats"]["catalog_key"] == "whale"
    assert cs.validate_constellation(row["points"], row["connections"]) == []


def test_shape_retry_gets_validator_feedback(env):
    db, llm = env
    llm.shapes = [BAD_SHAPE, SHAPE]
    _seed(db, USER_A, "travel", 30)
    _, bg, _ = _post(USER_A)
    _run(bg)
    assert _row(db, USER_A)["shape_source"] == "llm"
    assert "rejected by the validator" in llm.users[-1]


def test_more_diaries_later_keep_the_same_constellation(env):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    _, bg, _ = _post(USER_A)
    _run(bg)
    before = copy.deepcopy(_row(db, USER_A))
    _seed(db, USER_A, "travel", 10, start=500)  # 40개
    after, bg2, res = _post(USER_A)
    assert bg2.tasks == [] and res.status_code == 200
    assert after["points"] == before["points"] and after["planet_ids"] == before["planet_ids"]
    assert _row(db, USER_A)["completed_at"] == before["completed_at"]


def test_consent_is_required(env):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    with pytest.raises(HTTPException) as err:
        _post(USER_A, consent=False)
    assert err.value.status_code == 400 and err.value.detail["code"] == "consent_required"
    assert llm.calls == []


def test_not_configured_returns_503(env, monkeypatch):
    db, llm = env
    monkeypatch.setattr(router.settings, "openai_api_key", "")
    _seed(db, USER_A, "travel", 30)
    with pytest.raises(HTTPException) as err:
        _post(USER_A)
    assert err.value.status_code == 503 and llm.calls == []


def test_attempts_are_limited(env, monkeypatch):
    db, llm = env
    monkeypatch.setattr(router.settings, "personal_constellation_max_attempts", 2)
    llm.fail = llm_client.LLMError("network", "timeout", retryable=True)
    _seed(db, USER_A, "travel", 30)
    for _ in range(2):
        _, bg, _ = _post(USER_A)
        _run(bg)
    with pytest.raises(HTTPException) as err:
        _post(USER_A)
    assert err.value.status_code == 429
    assert llm.calls.count("constellation_concept") == 2


def test_stale_pending_can_be_reclaimed(env, monkeypatch):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    _post(USER_A)  # 작업을 실행하지 않음(서버가 중간에 멈춘 상황)
    old = (datetime.now(timezone.utc) - timedelta(seconds=999)).isoformat()
    _row(db, USER_A)["updated_at"] = old
    assert router.list_personal(user_id=USER_A)[0]["error_code"] == "stalled"
    _, bg, _ = _post(USER_A)
    assert len(bg.tasks) == 1
    _run(bg)
    assert _row(db, USER_A)["status"] == "ready"


def test_stale_run_cannot_overwrite_newer_run(env):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    _, bg_old, _ = _post(USER_A)
    _row(db, USER_A)["updated_at"] = (datetime.now(timezone.utc) - timedelta(seconds=999)).isoformat()
    _, bg_new, _ = _post(USER_A)
    llm.fail = llm_client.LLMError("server")
    _run(bg_old)  # 늦게 끝난 옛 작업: run_id 가 달라 저장되지 않는다
    assert _row(db, USER_A)["status"] == "pending"
    llm.fail = None
    _run(bg_new)
    assert _row(db, USER_A)["status"] == "ready"


def test_users_only_see_their_own(env):
    db, llm = env
    _seed(db, USER_A, "travel", 30)
    _seed(db, USER_B, "travel", 5, start=300)
    _, bg, _ = _post(USER_A)
    _run(bg)
    assert router.list_personal(user_id=USER_B) == []
    with pytest.raises(HTTPException) as err:  # B 는 A 의 일기로 만들 수 없다(B 의 여행 일기는 5개)
        _post(USER_B)
    assert err.value.detail["count"] == 5


def test_llm_input_has_no_account_data_and_logs_have_no_content(env, caplog):
    db, llm = env
    _seed(db, USER_A, "travel", 30, text="연락처 010-1234-5678, 메일 me@example.com 바다에서 수영했다")
    caplog.set_level(logging.DEBUG)
    _, bg, _ = _post(USER_A)
    _run(bg)
    sent = "\n".join(llm.users)
    assert USER_A not in sent and "me@example.com" not in sent and "010-1234-5678" not in sent
    assert "바다에서 수영했다" in sent  # 분석에 필요한 내용은 보낸다
    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "바다에서 수영했다" not in logs and SECRET_KEY not in logs and USER_A not in logs


# ---------------------------------------------------------------------------- 입력 크기 전략
def _inputs(n, chars):
    return [cl.DiaryInput(id=f"d{i:03d}", created_at=f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}T00:00:00+00:00",
                          content=("가" * (chars - 4)) + f"{i:04d}", pos=(math.cos(i), math.sin(i), i / 10)) for i in range(n)]


def test_small_input_is_single_pass():
    llm = FakeLLM()
    usage = llm_client.LLMUsage()
    import app.constellation_llm as mod

    orig = mod.llm_client.chat_json
    mod.llm_client.chat_json = llm
    try:
        concept, stats = cl.decide_concept("travel", cl.prepare(_inputs(30, 100)), usage)
    finally:
        mod.llm_client.chat_json = orig
    assert stats["input_mode"] == "single" and stats["diaries_analyzed"] == 30
    assert llm.calls == ["constellation_concept"]


def test_large_input_is_chunked_and_spans_whole_period(monkeypatch):
    llm = FakeLLM()
    monkeypatch.setattr(cl.llm_client, "chat_json", llm)
    items = cl.prepare(_inputs(200, 400))  # 80,000자 → 예산(36,000자) 초과
    concept, stats = cl.decide_concept("travel", items, llm_client.LLMUsage())
    assert stats["input_mode"] == "map_reduce"
    assert 1 < llm.calls.count("constellation_themes") <= cl.MAX_CHUNKS
    assert llm.calls[-1] == "constellation_concept"
    picked = cl.representative(items, cl.CHUNK_CHARS * cl.MAX_CHUNKS)
    assert sum(len(i["text"]) for i in picked) <= cl.CHUNK_CHARS * cl.MAX_CHUNKS
    assert picked[0]["id"] == "d000"  # 오래된 기록도 포함(최근 것만 고르지 않음)
    early = sum(1 for i in picked if i["id"] < "d100")
    assert early >= len(picked) // 4  # 앞쪽 기간에서도 고르게


def test_redact_hides_contact_details():
    out = cl.redact("메일 a.b@test.co.kr 번호 010-9876-5432 링크 https://x.y/z 끝")
    assert "a.b@test.co.kr" not in out and "9876" not in out and "https://" not in out and "끝" in out


def test_clean_concept_limits_and_name_suffix():
    raw = copy.deepcopy(CONCEPT) | {"name": "아주아주아주아주 긴 바다 고래 이야기", "keywords": ["a"] * 20,
                                    "concept": "Whale<script>", "closest_shape": "unknown"}
    out = cl.clean_concept(raw)
    assert out["name"].endswith("별자리") and len(out["name"]) <= 20
    assert out["concept"] == "whalescript" and out["closest_shape"] == "balloon"
    assert len(out["keywords"]) == 1


def test_unsafe_concept_is_rejected(monkeypatch):
    llm = FakeLLM()
    bad = copy.deepcopy(CONCEPT) | {"concept": "knife", "name": "칼 별자리", "shape_label": "칼"}
    monkeypatch.setattr(cl.llm_client, "chat_json", lambda **k: (llm(**k), copy.deepcopy(bad))[1])
    with pytest.raises(cl.GenerationError) as err:
        cl.decide_concept("travel", cl.prepare(_inputs(30, 50)), llm_client.LLMUsage())
    assert err.value.code == "unsafe_concept" and llm.calls.count("constellation_concept") == 2


# ---------------------------------------------------------------------------- 경로 → 30개 점
def test_parser_rejects_markup_and_limits():
    for bad in ["<svg onload=alert(1)>", "M 0 0 L 10 10 <script>", "javascript:alert(1)", "M 0 0 url(x)"]:
        with pytest.raises(cs.ShapeError):
            cs.parse_path(bad)
    with pytest.raises(cs.ShapeError):
        cs.parse_path("M 0 0 " + "L 1 1 " * 400)  # 너무 김
    with pytest.raises(cs.ShapeError):
        cs.parse_path("M 0 0 L 500 10")  # 좌표 범위 밖
    with pytest.raises(cs.ShapeError):
        cs.parse_path("L 10 10")  # M 으로 시작하지 않음
    with pytest.raises(cs.ShapeError):
        cs.build_constellation({"strokes": [{"d": "M 0 0 L 1 1"}] * (cs.MAX_STROKES + 1)})


def test_parser_handles_relative_implicit_curves_and_arcs():
    (pts, closed), = cs.parse_path("m 10 10 20 0 0 20 -20 0 z")
    assert closed and len(pts) == 4 and pts[2] == (30.0, 30.0)
    (arc, _), = cs.parse_path("M 10 50 A 40 40 0 0 1 90 50")
    assert max(abs(math.dist(p, (50, 50)) - 40) for p in arc) < 0.5 and min(p[1] for p in arc) < 11
    (curve, _), = cs.parse_path("M 0 0 C 0 50 50 50 50 0 S 100 -10 100 0 Q 80 50 60 50 T 20 50")
    assert all(math.isfinite(c) for p in curve for c in p)


def test_build_keeps_features_and_spacing():
    out = cs.build_from_catalog("whale")
    pts = out["points"]
    assert len(pts) == 30 and cs.validate_constellation(pts, out["connections"]) == []
    # 꼬리 위·아래 끝(특징점)이 실제 행성 자리로 남는다: 정규화 좌표에서 가장 오른쪽 위/아래 근처
    right = sorted(pts, key=lambda p: -p[0])[:4]
    assert any(p[1] > 0.25 for p in right) and any(p[1] < -0.05 for p in right)
    assert out["stats"]["keypoints_used"] >= 2
    md = min(math.dist(pts[i][:2], pts[j][:2]) for i in range(30) for j in range(i + 1, 30))
    assert md >= cs.VALID_MIN_DIST


def test_connections_follow_strokes_not_index_order():
    out = cs.build_from_catalog("house")
    conns = out["connections"]
    assert len({tuple(sorted(c)) for c in conns}) == len(conns)  # 중복 없음
    assert any(abs(a - b) > 1 for a, b in conns)  # 순서대로만 잇지 않는다(윤곽 닫기·문·굴뚝 이음점)
    assert len(conns) <= cs.MAX_LINES


@pytest.mark.parametrize("key", cs.CATALOG_KEYS)
def test_every_catalog_shape_is_valid(key):
    out = cs.build_from_catalog(key)
    assert cs.validate_constellation(out["points"], out["connections"]) == []


def test_validate_reports_problems():
    pts = [[0.0, 0.0, 0.0]] * 30
    assert any(p.startswith("points_too_close") for p in cs.validate_constellation(pts, [[0, 1]]))
    assert cs.validate_constellation([[0, 0, 0]] * 29, [[0, 1]]) == ["point_count:29"]
    good = cs.build_from_catalog("fish")
    assert cs.validate_constellation(good["points"], [[0, 30]]) == ["bad_connection_index"]
    assert cs.validate_constellation([[math.nan, 0, 0]] + good["points"][1:], good["connections"]) == ["bad_coordinate"]


def test_self_crossing_scribble_is_rejected():
    zigzag = "M 0 0 L 100 100 L 0 100 L 100 0 L 0 50 L 100 50 L 50 0 L 50 100 Z"
    with pytest.raises(cs.ShapeError) as err:
        cs.build_constellation({"strokes": [{"role": "outline", "closed": True, "d": zigzag}], "keypoints": []})
    assert "crossings" in str(err.value) or "not_enough_room" in str(err.value)


# ---------------------------------------------------------------------------- LLM 클라이언트
class _HTTPResp:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body

    def json(self):
        return self._body


def _ok(content='{"a": 1}', finish="stop", refusal=None):
    return _HTTPResp(200, {
        "choices": [{"finish_reason": finish, "message": {"content": content, "refusal": refusal}}],
        "usage": {"prompt_tokens": 11, "completion_tokens": 7, "completion_tokens_details": {"reasoning_tokens": 3}},
    })


@pytest.fixture()
def llm_env(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "openai_api_key", SECRET_KEY)
    monkeypatch.setattr(llm_client.settings, "llm_model", "test-model")
    monkeypatch.setattr(llm_client.settings, "llm_max_retries", 2)
    monkeypatch.setattr(llm_client.settings, "llm_reasoning_effort", "low")
    monkeypatch.setattr(llm_client.time, "sleep", lambda s: None)
    sent = []

    def install(*responses):
        queue = list(responses)

        def fake_post(url, json, headers, timeout):
            sent.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
            r = queue.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        monkeypatch.setattr(llm_client.httpx, "post", fake_post)

    return install, sent


def _call(usage=None):
    return llm_client.chat_json(purpose="t", system="s", user="u", schema_name="n", schema={"type": "object"},
                                usage=usage or llm_client.LLMUsage())


def test_llm_request_shape(llm_env):
    install, sent = llm_env
    install(_ok())
    usage = llm_client.LLMUsage()
    assert _call(usage) == {"a": 1}
    body = sent[0]["json"]
    assert sent[0]["url"].endswith("/chat/completions")
    assert body["response_format"]["json_schema"]["strict"] is True and body["store"] is False
    assert body["max_completion_tokens"] > 0 and body["reasoning_effort"] == "low"
    assert sent[0]["headers"]["Authorization"] == f"Bearer {SECRET_KEY}"
    assert usage.as_dict()["input_tokens"] == 11 and usage.reasoning_tokens == 3 and usage.calls == 1


def test_llm_retries_server_errors_then_succeeds(llm_env):
    install, sent = llm_env
    install(_HTTPResp(500, {}), httpx.ReadTimeout("t"), _ok())
    usage = llm_client.LLMUsage()
    assert _call(usage) == {"a": 1} and len(sent) == 3 and usage.calls == 3


@pytest.mark.parametrize("resp, code", [
    (_HTTPResp(401, {}), "auth"),
    (_HTTPResp(429, {"error": {"code": "insufficient_quota"}}), "quota"),
    (_HTTPResp(400, {"error": {"code": "invalid_request_error"}}), "bad_request"),
    (_ok(refusal="no"), "refusal"),
    (_ok(finish="length"), "truncated"),
    (_ok(content="not json"), "bad_response"),
])
def test_llm_non_retryable_errors(llm_env, resp, code):
    install, sent = llm_env
    install(resp)
    with pytest.raises(llm_client.LLMError) as err:
        _call()
    assert err.value.code == code and len(sent) == 1


def test_llm_gives_up_after_retries(llm_env):
    install, sent = llm_env
    install(_HTTPResp(503, {}), _HTTPResp(503, {}), _HTTPResp(503, {}))
    with pytest.raises(llm_client.LLMError) as err:
        _call()
    assert err.value.code == "server" and len(sent) == 3


def test_llm_not_configured(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "openai_api_key", "")
    with pytest.raises(llm_client.LLMError) as err:
        _call()
    assert err.value.code == "not_configured"


# ---------------------------------------------------------------------------- 실제 호출에서 나온 문제(선 위에 얹힌 점)
def test_split_on_lines_joins_t_junction():
    pts = [[-1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.01, 0.0], [0.0, 0.8, 0.0]]
    out = cs.split_on_lines(pts, [[0, 1], [2, 3]])
    assert sorted(map(sorted, out)) == [[0, 2], [1, 2], [2, 3]]
    assert cs.min_clearance(pts, out) > cs.ON_LINE_TOL


def test_validate_flags_point_on_unrelated_line():
    pts = [[math.cos(2 * math.pi * k / 30), math.sin(2 * math.pi * k / 30), 0.0] for k in range(30)]
    ring = [[k, (k + 1) % 30] for k in range(30)]
    assert cs.validate_constellation(pts, ring) == []
    moved = copy.deepcopy(pts)
    moved[15] = [0.0, 0.005, 0.0]  # 0-… 사이 지름선 위에 놓이게
    bad = cs.validate_constellation(moved, ring[:14] + [[14, 16], [16, 17]] + ring[17:] + [[0, 15], [7, 22]])
    assert any(p.startswith("point_on_line") for p in bad)


def test_built_shapes_have_no_point_on_line():
    spec = {"strokes": [
        {"role": "outline", "d": "M 10 10 L 90 10 L 90 90 L 10 90 Z"},
        {"role": "detail", "d": "M 50 10 L 50 60"},  # 윗변에 붙는 T자 이음
        {"role": "detail", "d": "M 20 50 L 50 50"},  # 세로선 중간에 붙는 T자 이음
    ]}
    r = cs.build_constellation(spec)
    assert cs.min_clearance(r["points"], r["connections"]) >= cs.ON_LINE_TOL * 0.85
    for key in cs.CATALOG_KEYS:
        c = cs.build_from_catalog(key)
        assert cs.min_clearance(c["points"], c["connections"]) >= cs.ON_LINE_TOL * 0.85, key


def test_prompts_ask_for_recognizable_silhouette():
    assert "원·사각형 하나로만" in cl.concept_system("relationship")
    assert "must not run alongside" in cl.SHAPE_SYSTEM
