import pytest
from fastapi import HTTPException

from app.routers import groups
from app.schemas.group import GroupCreate, GroupJoin


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, name, db):
        self._name = name
        self._db = db
        self._payload = None
        self._eq = {}
        self._in_ids = None

    def select(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._payload = payload
        self._db[f"{self._name}_inserts"].append(payload)
        return self

    def upsert(self, payload, **_k):
        self._payload = payload
        self._db[f"{self._name}_inserts"].append(payload)
        return self

    def eq(self, field, value):
        self._eq[field] = value
        return self

    def in_(self, _field, ids):
        self._in_ids = set(ids)
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        if self._name == "groups":
            if self._payload is not None:  # insert
                row = {
                    "id": "group-new",
                    "user_id": self._payload["user_id"],
                    "name": self._payload["name"],
                    "invite_code": self._payload["invite_code"],
                    "created_at": "2026-11-12T00:00:00+00:00",
                }
                self._db["groups"].append(row)
                return _FakeResult([row])
            rows = [g for g in self._db["groups"] if all(g.get(k) == v for k, v in self._eq.items())]
            return _FakeResult([{**g, "diary_groups": []} for g in rows])
        if self._name == "group_members":
            if self._payload is not None:  # insert/upsert: 조회 목록에도 반영
                self._db["group_members"].append(self._payload)
                return _FakeResult([self._payload])
            rows = self._db["group_members"]
            rows = [r for r in rows if all(r.get(k) == v for k, v in self._eq.items())]
            if self._in_ids is not None:
                rows = [r for r in rows if r["group_id"] in self._in_ids]
            return _FakeResult(rows)
        if self._name == "profiles":
            return _FakeResult([])
        return _FakeResult([])


class _FakeSupabase:
    def __init__(self, groups_rows=(), member_rows=()):
        self._db = {
            "groups": list(groups_rows),
            "group_members": list(member_rows),
            "groups_inserts": [],
            "group_members_inserts": [],
            "profiles_inserts": [],
        }

    def table(self, name):
        return _FakeTable(name, self._db)


def test_create_group_makes_code_and_owner_membership(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(groups, "supabase", fake)

    result = groups.create_group(GroupCreate(name="  우리 우주  "), user_id="user-1")

    assert result["name"] == "우리 우주"  # 서버에서 trim
    code = result["invite_code"]
    assert len(code) == groups._CODE_LENGTH
    assert all(c in groups._CODE_ALPHABET for c in code)  # 헷갈리는 0/O/1/I 없음
    # 소유자가 멤버로 등록됨
    assert {"group_id": "group-new", "user_id": "user-1"} in fake._db["group_members_inserts"]
    assert [m["user_id"] for m in result["members"]] == ["user-1"]


def test_join_group_by_code_adds_membership(monkeypatch):
    existing = {
        "id": "group-1",
        "user_id": "owner",
        "name": "친구방",
        "invite_code": "ABCD2345",
        "created_at": "2026-11-12T00:00:00+00:00",
    }
    fake = _FakeSupabase(groups_rows=[existing], member_rows=[{"group_id": "group-1", "user_id": "owner"}])
    monkeypatch.setattr(groups, "supabase", fake)

    result = groups.join_group(GroupJoin(invite_code="abcd2345"), user_id="friend")  # 소문자도 허용

    assert result["id"] == "group-1"
    assert {"group_id": "group-1", "user_id": "friend"} in fake._db["group_members_inserts"]


def test_join_group_unknown_code_404(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(groups, "supabase", fake)

    with pytest.raises(HTTPException) as exc:
        groups.join_group(GroupJoin(invite_code="NOPE2345"), user_id="friend")
    assert exc.value.status_code == 404
