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
        self._is_select = False

    def select(self, *_a, **_k):
        self._is_select = True
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
        # stars: 조회(select)는 지금까지 만든 별 + 미리 넣어 둔 별을 돌려준다(겹침 검사용).
        if self._is_select and self._payload is None:
            return _FakeResult(self._db["existing_stars"] + self._db["star_inserts"])
        self._db["star_inserts"].append(self._payload)
        return _FakeResult([])


class _FakeSupabase:
    def __init__(self, owned_group_ids=(), existing_stars=()):
        self.star_inserts = []
        self.diary_group_inserts = []
        self._db = {
            "owned_group_ids": set(owned_group_ids),
            "star_inserts": self.star_inserts,
            "diary_group_inserts": self.diary_group_inserts,
            "existing_stars": list(existing_stars),
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


def _min_gap(stars):
    gaps = [
        math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"])) - (a["size"] + b["size"])
        for i, a in enumerate(stars)
        for b in stars[i + 1 :]
    ]
    return min(gaps)


def test_new_stars_keep_min_gap(monkeypatch):
    # 크기가 제각각인 별 60개를 만들어도 서로 최소 간격 이상 떨어져야 한다.
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)

    for i in range(60):
        diaries.create_diary(DiaryCreate(content="x" * (i * 7 % 400 + 1)), user_id="user-1")

    assert len(fake.star_inserts) == 60
    assert _min_gap(fake.star_inserts) >= diaries.STAR_MIN_GAP - 1e-9


def test_new_star_avoids_existing_star(monkeypatch):
    # 이미 있는 큰 별 주변 자리는 피해야 한다.
    existing = [{"x": 0.0, "y": 0.0, "z": 7.0, "size": 1.2}]
    fake = _FakeSupabase(existing_stars=existing)
    monkeypatch.setattr(diaries, "supabase", fake)

    for _ in range(20):
        diaries.create_diary(DiaryCreate(content="x" * 400), user_id="user-1")

    assert _min_gap(existing + fake.star_inserts) >= diaries.STAR_MIN_GAP - 1e-9
