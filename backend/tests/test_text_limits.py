import pytest
from pydantic import ValidationError
from app.schemas.group import GroupCreate
from app.schemas.profile import ProfileUpdate

def test_group_and_profile_accept_new_limits():
    assert GroupCreate(name='가' * 8).name == '가' * 8
    assert ProfileUpdate(nickname='나' * 8, bio='다' * 20).bio == '다' * 20

@pytest.mark.parametrize('value', ['가' * 9, 'a' * 9])
def test_group_rejects_long_names(value):
    with pytest.raises(ValidationError):
        GroupCreate(name=value)

@pytest.mark.parametrize('fields', [{'nickname': '가' * 9}, {'nickname': '나', 'bio': '다' * 21}])
def test_profile_rejects_long_fields(fields):
    with pytest.raises(ValidationError):
        ProfileUpdate(**fields)
