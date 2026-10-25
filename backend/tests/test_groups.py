from app.routers import groups
from app.schemas.group import GroupCreate


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, name, rows):
        self._name = name
        self._rows = rows
        self._payload = None

    def select(self, *_a, **_k):
        return self

    def insert(self, payload):
        self._payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        if self._name == "groups" and self._payload is None:
            return _FakeResult(self._rows)
        return _FakeResult(
            [{"id": "group-1", "user_id": "user-1", "name": self._payload["name"], "created_at": "now"}]
        )


class _FakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _FakeTable(name, self._rows)


def test_list_groups_flattens_diary_ids(monkeypatch):
    rows = [
        {
            "id": "group-1",
            "user_id": "user-1",
            "name": "그룹1",
            "created_at": "now",
            "diary_groups": [{"diary_id": "diary-1"}, {"diary_id": "diary-2"}],
        },
        {
            "id": "group-2",
            "user_id": "user-1",
            "name": "그룹2",
            "created_at": "now",
            "diary_groups": [],
        },
    ]
    monkeypatch.setattr(groups, "supabase", _FakeSupabase(rows))

    result = groups.list_groups(user_id="user-1")

    assert result[0]["diary_ids"] == ["diary-1", "diary-2"]
    assert result[1]["diary_ids"] == []
    assert "diary_groups" not in result[0]


def test_create_group_starts_with_no_diaries(monkeypatch):
    monkeypatch.setattr(groups, "supabase", _FakeSupabase([]))

    created = groups.create_group(GroupCreate(name="새 그룹"), user_id="user-1")

    assert created["name"] == "새 그룹"
    assert created["diary_ids"] == []
