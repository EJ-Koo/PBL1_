import math

from app.routers import diaries
from app.schemas.diary import DiaryCreate


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, name, star_inserts):
        self._name = name
        self._star_inserts = star_inserts
        self._payload = None

    def insert(self, payload):
        self._payload = payload
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        if self._name == "diaries":
            return _FakeResult(
                [{"id": "diary-1", "created_at": "2026-01-01T00:00:00+00:00", **self._payload}]
            )
        self._star_inserts.append(self._payload)
        return _FakeResult([])


class _FakeSupabase:
    def __init__(self):
        self.star_inserts = []

    def table(self, name):
        return _FakeTable(name, self.star_inserts)


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
