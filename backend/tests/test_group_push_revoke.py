import hashlib
from uuid import UUID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.routers import group_social


DEVICE = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
SECRET = 'unit-test-device-capability-only-123456789'


class DeviceDB:
    def __init__(self):
        self.rows = [dict(id=value, secret_hash=hashlib.sha256(SECRET.encode()).hexdigest(), active=True)
                     for value in (DEVICE, OTHER)]
        self.filters = {}

    def table(self, name):
        assert name == 'group_push_devices'
        return self

    def update(self, changes):
        assert changes == {'active': False}  # No enabling/rebinding/reading capability.
        self.changes = changes
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def execute(self):
        assert set(self.filters) == {'id', 'secret_hash'}
        for row in self.rows:
            if all(row.get(key) == value for key, value in self.filters.items()):
                row.update(self.changes)


@pytest.mark.parametrize('secret,disabled', [(SECRET, True), ('wrong-capability-value-1234567890123456', False)])
def test_logged_out_revoke_requires_both_device_id_and_secret(monkeypatch, secret, disabled):
    db = DeviceDB()
    monkeypatch.setattr(group_social, 'supabase', db)
    response = group_social.revoke_device(group_social.PushDeviceRevoke(id=UUID(DEVICE), secret=secret))
    assert response.status_code == 204
    assert response.body == b''
    assert db.rows[0]['active'] is not disabled
    assert db.rows[1]['active'] is True
    assert db.filters['secret_hash'] == hashlib.sha256(secret.encode()).hexdigest()


def test_revoke_errors_do_not_expose_device_secret(monkeypatch):
    class BrokenDB:
        def table(self, name):
            raise RuntimeError(SECRET)
    monkeypatch.setattr(group_social, 'supabase', BrokenDB())
    with pytest.raises(HTTPException) as error:
        group_social.revoke_device(group_social.PushDeviceRevoke(id=UUID(DEVICE), secret=SECRET))
    assert error.value.status_code == 503
    assert SECRET not in str(error.value.detail)


@pytest.mark.parametrize('secret', ['', 'short', 'x' * 129])
def test_revoke_rejects_invalid_capabilities(secret):
    with pytest.raises(ValidationError):
        group_social.PushDeviceRevoke(id=UUID(DEVICE), secret=secret)
