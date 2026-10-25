import pytest
from fastapi import HTTPException
from supabase import AuthApiError

from app.routers import admin_data


class _FakeTable:
    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        return type("Result", (), {"data": []})()


class _FakeAdminAuth:
    def __init__(self, delete_user_error):
        self._delete_user_error = delete_user_error

    def delete_user(self, _user_id):
        if self._delete_user_error:
            raise self._delete_user_error


class _FakeSupabase:
    def __init__(self, delete_user_error=None):
        self.auth = type("Auth", (), {"admin": _FakeAdminAuth(delete_user_error)})()

    def table(self, _name):
        return _FakeTable()


def test_delete_user_404_when_user_not_found(monkeypatch):
    monkeypatch.setattr(
        admin_data, "supabase", _FakeSupabase(AuthApiError("not found", 404, None))
    )

    with pytest.raises(HTTPException) as exc_info:
        admin_data.delete_user("missing-id", admin_id="admin")

    assert exc_info.value.status_code == 404


def test_delete_user_does_not_mask_other_errors_as_404(monkeypatch):
    monkeypatch.setattr(
        admin_data, "supabase", _FakeSupabase(AuthApiError("server error", 500, None))
    )

    with pytest.raises(AuthApiError):
        admin_data.delete_user("some-id", admin_id="admin")
