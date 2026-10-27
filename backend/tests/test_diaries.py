import math

import pytest
from fastapi import HTTPException

from app.routers import diaries
from app.schemas.diary import DiaryCreate


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, name, db):
        self._name = name
        self._db = db
        self._payload = None
        self._in_ids = None

    def select(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._payload = payload
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, _field, ids):
        self._in_ids = set(ids)
        return self

    def execute(self):
        if self._name == "diaries":
            return _FakeResult(
                [{"id": "diary-1", "created_at": "2026-01-01T00:00:00+00:00", **self._payload}]
            )
        if self._name == "groups":
            owned = self._db["owned_group_ids"]
            matched = owned & self._in_ids if self._in_ids is not None else owned
            return _FakeResult([{"id": gid} for gid in matched])
        if self._name == "diary_groups":
            self._db["diary_group_inserts"].extend(self._payload)
            return _FakeResult([])
        # stars
        self._db["star_inserts"].append(self._payload)
        return _FakeResult([])


class _FakeSupabase:
    def __init__(self, owned_group_ids=()):
        self.star_inserts = []
        self.diary_group_inserts = []
        self._db = {
            "owned_group_ids": set(owned_group_ids),
            "star_inserts": self.star_inserts,
            "diary_group_inserts": self.diary_group_inserts,
        }

    def table(self, name):
        return _FakeTable(name, self._db)


def test_create_diary_also_creates_a_star(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)

    diaries.create_diary(DiaryCreate(content="x" * 40), user_id="user-1")

    assert len(fake.star_inserts) == 1
    star = fake.star_inserts[0]
    assert star["diary_id"] == "diary-1"
    assert diaries.STAR_SIZE_RANGE[0] <= star["size"] <= diaries.STAR_SIZE_RANGE[1]
    radius = math.sqrt(star["x"] ** 2 + star["y"] ** 2 + star["z"] ** 2)
    assert diaries.STAR_RADIUS_RANGE[0] - 1e-6 <= radius <= diaries.STAR_RADIUS_RANGE[1] + 1e-6


def test_longer_content_makes_a_bigger_star(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)

    diaries.create_diary(DiaryCreate(content="short"), user_id="user-1")
    diaries.create_diary(DiaryCreate(content="x" * 1000), user_id="user-1")

    short_size, long_size = (s["size"] for s in fake.star_inserts)
    assert long_size > short_size


def test_create_diary_tags_owned_groups(monkeypatch):
    fake = _FakeSupabase(owned_group_ids={"group-1", "group-2"})
    monkeypatch.setattr(diaries, "supabase", fake)

    diaries.create_diary(
        DiaryCreate(content="hello", group_ids=["group-1", "group-2"]), user_id="user-1"
    )

    tagged_group_ids = {row["group_id"] for row in fake.diary_group_inserts}
    assert tagged_group_ids == {"group-1", "group-2"}
    assert all(row["diary_id"] == "diary-1" for row in fake.diary_group_inserts)


def test_create_diary_rejects_group_not_owned(monkeypatch):
    fake = _FakeSupabase(owned_group_ids={"group-1"})
    monkeypatch.setattr(diaries, "supabase", fake)

    with pytest.raises(HTTPException) as exc_info:
        diaries.create_diary(
            DiaryCreate(content="hello", group_ids=["group-1", "not-mine"]), user_id="user-1"
        )

    assert exc_info.value.status_code == 404
    assert fake.star_inserts == []


def test_create_diary_stores_ai_star_color_and_brightness(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)
    monkeypatch.setattr(
        diaries.ai_client, "analyze_diary", lambda content: {"color": "#FED240", "brightness": 1.4}
    )

    diaries.create_diary(DiaryCreate(content="오늘 정말 기뻤다"), user_id="user-1")

    star = fake.star_inserts[0]
    assert star["color"] == "#FED240"
    assert star["brightness"] == 1.4


def test_create_diary_without_ai_keeps_default_star_attributes(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)
    monkeypatch.setattr(diaries.ai_client, "analyze_diary", lambda content: None)

    diaries.create_diary(DiaryCreate(content="hello"), user_id="user-1")

    star = fake.star_inserts[0]
    assert "color" not in star and "brightness" not in star


def test_create_diary_uses_ai_position(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)
    calls = {}

    def fake_place(user_id, diary_id, content):
        calls.update(user_id=user_id, diary_id=diary_id, content=content)
        return {"x": 1.0, "y": 2.0, "z": 3.0}

    monkeypatch.setattr(diaries.ai_client, "place_diary", fake_place)

    diaries.create_diary(DiaryCreate(content="오늘 수학 시험"), user_id="user-1")

    star = fake.star_inserts[0]
    assert (star["x"], star["y"], star["z"]) == (1.0, 2.0, 3.0)
    assert calls == {"user_id": "user-1", "diary_id": "diary-1", "content": "오늘 수학 시험"}


def test_create_diary_falls_back_to_random_position_without_ai(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)
    monkeypatch.setattr(diaries.ai_client, "place_diary", lambda *a: None)

    diaries.create_diary(DiaryCreate(content="hello"), user_id="user-1")

    star = fake.star_inserts[0]
    radius = math.sqrt(star["x"] ** 2 + star["y"] ** 2 + star["z"] ** 2)
    assert diaries.STAR_RADIUS_RANGE[0] - 1e-6 <= radius <= diaries.STAR_RADIUS_RANGE[1] + 1e-6


class _RelatedFakeTable:
    def __init__(self, rows):
        self._rows = rows
        self._filters = {}
        self._in = None

    def select(self, *_a, **_k):
        return self

    def eq(self, field, value):
        self._filters[field] = value
        return self

    def in_(self, _field, ids):
        self._in = set(ids)
        return self

    def execute(self):
        rows = [r for r in self._rows if all(r.get(k) == v for k, v in self._filters.items())]
        if self._in is not None:
            rows = [r for r in rows if r["id"] in self._in]
        return _FakeResult(rows)


class _RelatedFakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _RelatedFakeTable(self._rows)


def test_related_diaries_returns_only_own_existing_diaries(monkeypatch):
    query_id = "11111111-1111-1111-1111-111111111111"
    rows = [
        {"id": query_id, "user_id": "user-1", "content": "수학 시험 걱정", "created_at": "2026-01-01T00:00:00+00:00"},
        {"id": "d-mine", "user_id": "user-1", "content": "수학 시험 결과", "created_at": "2026-01-02T00:00:00+00:00"},
        {"id": "d-other", "user_id": "user-2", "content": "남의 일기", "created_at": "2026-01-02T00:00:00+00:00"},
    ]
    monkeypatch.setattr(diaries, "supabase", _RelatedFakeSupabase(rows))
    monkeypatch.setattr(
        diaries.ai_client,
        "related_diaries",
        lambda user_id, diary_id: [
            {"diary_id": "d-mine", "similarity": 0.62},
            {"diary_id": "d-other", "similarity": 0.60},
            {"diary_id": "d-deleted", "similarity": 0.58},
        ],
    )

    result = diaries.get_related_diaries(query_id, user_id="user-1")

    assert [r["diary_id"] for r in result] == ["d-mine"]
    assert result[0]["similarity"] == 0.62 and result[0]["content"] == "수학 시험 결과"


def test_related_diaries_empty_without_ai(monkeypatch):
    query_id = "11111111-1111-1111-1111-111111111111"
    rows = [{"id": query_id, "user_id": "user-1", "content": "x", "created_at": "2026-01-01T00:00:00+00:00"}]
    monkeypatch.setattr(diaries, "supabase", _RelatedFakeSupabase(rows))
    monkeypatch.setattr(diaries.ai_client, "related_diaries", lambda *a: None)

    assert diaries.get_related_diaries(query_id, user_id="user-1") == []
