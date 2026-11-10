"""일기 사진 여러 장(최대 5장) 저장·수정·삭제 테스트."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.routers import diaries
from app.schemas.diary import DiaryCreate, DiaryUpdate


class _Result:
    def __init__(self, data):
        self.data = data


class _Storage:
    def __init__(self, removed):
        self._removed = removed

    def create_signed_url(self, path, _ttl):
        return {"signedURL": f"https://signed/{path}"}

    def remove(self, paths):
        self._removed.extend(paths)


class _Table:
    def __init__(self, fake, name):
        self._fake = fake
        self._name = name
        self._op = "select"
        self._payload = None

    def select(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def execute(self):
        fake = self._fake
        if self._name == "diaries":
            if self._op in ("insert", "update"):
                if "photo_paths" in self._payload and not fake.has_photo_paths_column:
                    raise Exception("Could not find the 'photo_paths' column of 'diaries'")
                fake.diary_writes.append(dict(self._payload))
                fake.row = {**fake.row, **self._payload}
                return _Result([dict(fake.row)])
            if self._op == "delete":
                return _Result([])
            return _Result([dict(fake.row)])
        return _Result([])


class _FakeSupabase:
    def __init__(self, has_photo_paths_column=True, row=None):
        self.has_photo_paths_column = has_photo_paths_column
        self.diary_writes = []
        self.removed = []
        now = datetime.now(timezone.utc).isoformat()
        self.row = row or {
            "id": "diary-1",
            "user_id": "user-1",
            "content": "hello",
            "photo_url": None,
            "visibility": "private",
            "created_at": now,
            "updated_at": now,
        }
        self.storage = type("S", (), {"from_": lambda _self, _b: _Storage(self.removed)})()

    def table(self, name):
        return _Table(self, name)


@pytest.fixture(autouse=True)
def _reset_column_flag(monkeypatch):
    monkeypatch.setattr(diaries, "_photo_paths_column", True)


def test_create_saves_all_photos_in_order(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)

    out = diaries.create_diary(
        DiaryCreate(content="hi", photo_paths=["a.jpg", "b.jpg", "c.jpg"]), user_id="user-1"
    )

    assert fake.diary_writes[0]["photo_paths"] == ["a.jpg", "b.jpg", "c.jpg"]
    assert fake.diary_writes[0]["photo_url"] == "a.jpg"
    assert out["photo_paths"] == ["a.jpg", "b.jpg", "c.jpg"]
    assert out["photo_urls"] == ["https://signed/a.jpg", "https://signed/b.jpg", "https://signed/c.jpg"]
    assert out["photo_url"] == "https://signed/a.jpg"


def test_more_than_five_photos_rejected():
    with pytest.raises(ValidationError):
        DiaryCreate(content="hi", photo_paths=[f"{i}.jpg" for i in range(6)])


def test_old_client_single_photo_still_works(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, "supabase", fake)

    out = diaries.create_diary(DiaryCreate(content="hi", photo_url="only.jpg"), user_id="user-1")

    assert fake.diary_writes[0]["photo_paths"] == ["only.jpg"]
    assert out["photo_urls"] == ["https://signed/only.jpg"]


def test_without_migration_saves_first_photo_and_does_not_fail(monkeypatch):
    # Supabase에서 photo_paths 컬럼 마이그레이션을 아직 안 돌렸을 때
    fake = _FakeSupabase(has_photo_paths_column=False)
    monkeypatch.setattr(diaries, "supabase", fake)

    out = diaries.create_diary(
        DiaryCreate(content="hi", photo_paths=["a.jpg", "b.jpg"]), user_id="user-1"
    )

    assert fake.diary_writes[-1] == {
        "user_id": "user-1",
        "content": "hi",
        "photo_url": "a.jpg",
        "visibility": "private",
    }
    assert out["photo_paths"] == ["a.jpg"]


def test_update_replaces_photos_and_removes_dropped_files(monkeypatch):
    fake = _FakeSupabase()
    fake.row = {**fake.row, "photo_url": "a.jpg", "photo_paths": ["a.jpg", "b.jpg", "c.jpg"]}
    monkeypatch.setattr(diaries, "supabase", fake)

    out = diaries.update_diary(
        uuid4(), DiaryUpdate(photo_paths=["c.jpg", "d.jpg"]), user_id="user-1"
    )

    assert out["photo_paths"] == ["c.jpg", "d.jpg"]
    assert fake.row["photo_url"] == "c.jpg"
    assert sorted(fake.removed) == ["a.jpg", "b.jpg"]


def test_update_text_only_keeps_photos(monkeypatch):
    fake = _FakeSupabase()
    fake.row = {**fake.row, "photo_url": "a.jpg", "photo_paths": ["a.jpg", "b.jpg"]}
    monkeypatch.setattr(diaries, "supabase", fake)

    out = diaries.update_diary(uuid4(), DiaryUpdate(content="new text"), user_id="user-1")

    assert out["photo_paths"] == ["a.jpg", "b.jpg"]
    assert fake.removed == []
    assert "photo_paths" not in fake.diary_writes[-1]


def test_delete_removes_every_photo(monkeypatch):
    fake = _FakeSupabase()
    fake.row = {**fake.row, "photo_url": "a.jpg", "photo_paths": ["a.jpg", "b.jpg"]}
    monkeypatch.setattr(diaries, "supabase", fake)

    diaries.delete_diary(uuid4(), user_id="user-1")

    assert sorted(fake.removed) == ["a.jpg", "b.jpg"]
