import asyncio
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from starlette.datastructures import Headers

from app.routers import auth, profiles, uploads
from app import db
from app.schemas.auth import RefreshRequest
from app.schemas.profile import ProfileUpdate

AVATAR = 'user-a/profile/11111111-1111-1111-1111-111111111111.png'


class Table:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}
        self.payload = None

    def select(self, *_): return self
    def eq(self, key, value): self.filters[key] = value; return self
    def upsert(self, payload, **_): self.payload = payload; return self
    def execute(self):
        if self.payload:
            found = next((r for r in self.rows if r['user_id'] == self.payload['user_id']), None)
            if found is None:
                found = {'id': 'profile-1', 'created_at': '2026-11-15T00:00:00Z'}
                self.rows.append(found)
            found.update(self.payload)
            return SimpleNamespace(data=[dict(found)])
        return SimpleNamespace(data=[dict(r) for r in self.rows if all(r.get(k) == v for k, v in self.filters.items())])


def fake_db(monkeypatch):
    rows = []
    bucket = Mock()
    bucket.create_signed_url.return_value = {'signedURL': 'https://example.invalid/signed-test-image'}
    db = SimpleNamespace(table=lambda _: Table(rows), storage=SimpleNamespace(from_=lambda _: bucket))
    monkeypatch.setattr(profiles, 'supabase', db)
    monkeypatch.setattr(uploads, 'supabase', db)
    return rows, bucket


def test_profile_create_update_and_private_avatar(monkeypatch):
    rows, bucket = fake_db(monkeypatch)
    first = profiles.update_my_profile(ProfileUpdate(nickname=' 별이 ', bio=' 안녕하세요 ', avatar_path=AVATAR), 'user-a')
    assert first['nickname'] == '별이' and first['bio'] == '안녕하세요'
    assert first['user_id'] == 'user-a' and first['avatar_url'].endswith('signed-test-image')
    profiles.update_my_profile(ProfileUpdate(nickname='새 이름', avatar_path=AVATAR), 'user-a')
    assert len(rows) == 1
    assert profiles.get_my_profile('user-a')['nickname'] == '새 이름'
    with pytest.raises(HTTPException) as exc:
        profiles.get_my_profile('user-b')
    assert exc.value.status_code == 404
    bucket.remove.assert_not_called()


@pytest.mark.parametrize('path', [AVATAR.replace('user-a/', 'user-b/'), 'user-a/profile/../private.png', 'https://example.invalid/photo.png'])
def test_profile_rejects_other_user_or_external_paths(monkeypatch, path):
    rows, _ = fake_db(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        profiles.update_my_profile(ProfileUpdate(nickname='별이', avatar_path=path), 'user-a')
    assert exc.value.status_code == 422 and rows == []


@pytest.mark.parametrize('payload', [{'nickname': '   '}, {'nickname': 'a' * 25}, {'nickname': '별이', 'bio': 'a' * 81}, {'nickname': '별이', 'bio': '두\n줄'}])
def test_profile_validation(payload):
    with pytest.raises(ValidationError): ProfileUpdate(**payload)


def test_replacing_avatar_removes_only_old_owned_image_after_save(monkeypatch):
    rows, bucket = fake_db(monkeypatch)
    rows.append({'id': '1', 'user_id': 'user-a', 'nickname': '별이', 'avatar_path': AVATAR, 'created_at': 't'})
    profiles.update_my_profile(ProfileUpdate(nickname='별이'), 'user-a')
    bucket.remove.assert_called_once_with([AVATAR])


def file(content, mime='image/png'):
    return UploadFile(filename='photo.png', file=BytesIO(content), headers=Headers({'content-type': mime}))


def test_avatar_upload_is_scoped_to_authenticated_owner(monkeypatch):
    _, bucket = fake_db(monkeypatch)
    result = asyncio.run(uploads.upload_avatar(file(b'\x89PNG\r\n\x1a\nimage'), 'user-a'))
    assert result['avatar_path'].startswith('user-a/profile/')
    assert bucket.upload.call_args.args[0] == result['avatar_path']


@pytest.mark.parametrize('content,mime', [(b'<svg/>', 'image/svg+xml'), (b'not a png', 'image/png'), (b'\x89PNG\r\n\x1a\n' + b'a' * (5 * 1024 * 1024), 'image/png')])
def test_avatar_upload_rejects_wrong_type_signature_or_size(monkeypatch, content, mime):
    _, bucket = fake_db(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(uploads.upload_avatar(file(content, mime), 'user-a'))
    assert exc.value.status_code == 400
    bucket.upload.assert_not_called()


def test_refresh_uses_new_auth_client_and_rotates_credentials(monkeypatch):
    client = Mock()
    client.auth.refresh_session.return_value = SimpleNamespace(session=SimpleNamespace(access_token='test-access', refresh_token='test-rotated'), user=SimpleNamespace(id='user-a'))
    factory = Mock(return_value=client)
    monkeypatch.setattr(auth, 'new_auth_client', factory)
    result = auth.refresh(RefreshRequest(refresh_token='test-refresh'))
    assert result.user_id == 'user-a' and result.refresh_token == 'test-rotated'
    client.auth.refresh_session.assert_called_once_with('test-refresh')
    factory.assert_called_once()


def test_ephemeral_auth_clients_do_not_refresh_or_persist_server_sessions(monkeypatch):
    factory = Mock()
    monkeypatch.setattr(db, 'create_client', factory)
    db.new_auth_client()
    options = factory.call_args.kwargs['options']
    assert options.auto_refresh_token is False
    assert options.persist_session is False


@pytest.mark.parametrize('status,expected', [(400, 401), (401, 401), (403, 401), (503, 503), (None, 503)])
def test_refresh_keeps_server_outages_distinct_from_invalid_credentials(monkeypatch, status, expected):
    error = RuntimeError('test failure')
    error.status = status
    client = Mock()
    client.auth.refresh_session.side_effect = error
    monkeypatch.setattr(auth, 'new_auth_client', lambda: client)
    with pytest.raises(HTTPException) as exc:
        auth.refresh(RefreshRequest(refresh_token='test-refresh'))
    assert exc.value.status_code == expected
