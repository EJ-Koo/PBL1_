import pytest
from fastapi import HTTPException

from app.routers import diaries, groups
from app.schemas.diary import DiaryCreate, DiaryUpdate
from test_diaries import _FakeSupabase, _ViewFakeSupabase, _view_db, _DID


def test_private_create_never_tags_groups(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(diaries, 'supabase', fake)
    diaries.create_diary(DiaryCreate(content='only me', visibility='private', group_ids=['old-selection']), 'owner')
    assert fake.diary_group_inserts == []
    assert len(fake.star_inserts) == 1  # Still appears in the owner's universe.


@pytest.mark.parametrize('visibility', ['private', None])
def test_private_or_missing_visibility_is_not_readable_by_group_member(monkeypatch, visibility):
    db = _view_db(diary_groups=[{'diary_id': _DID, 'group_id': 'g1'}],
                  group_members=[{'group_id': 'g1', 'user_id': 'friend'}])
    if visibility is None:
        del db['diaries'][0]['visibility']
    else:
        db['diaries'][0]['visibility'] = visibility
    monkeypatch.setattr(diaries, 'supabase', _ViewFakeSupabase(db))
    with pytest.raises(HTTPException) as error:
        diaries._get_viewable_diary(_DID, 'friend')
    assert error.value.status_code == 404
    assert diaries._get_viewable_diary(_DID, 'owner')['id'] == _DID


class Query:
    def __init__(self, table, data):
        self.table, self.data = table, data
        self.filters = {}
    def select(self, *args): return self
    def eq(self, key, value):
        self.filters[key] = value
        return self
    def in_(self, *args): return self
    def update(self, value):
        self.data['update'] = value
        return self
    def delete(self):
        self.data['deleted'] = self.table
        return self
    def execute(self):
        rows = self.data.get(self.table, [])
        if self.table == 'diary_groups' and self.data.get('deleted') == self.table:
            self.data['deleted_id'] = self.filters.get('diary_id')
        return type('Result', (), {'data': rows})()


class DB:
    def __init__(self, data): self.data = data
    def table(self, name): return Query(name, self.data)


def test_group_universe_filters_private_and_unknown_visibility_before_analysis(monkeypatch):
    def star(id, visibility):
        d = {'id': id, 'user_id': 'owner', 'content': id, 'created_at': '2026-11-15T00:00:00Z'}
        if visibility is not None: d['visibility'] = visibility
        return {'diary_id': id, 'diaries': d, 'x': 1, 'y': 2, 'z': 3, 'color': '#fff', 'size': .3, 'brightness': 1}
    data = {'diary_groups': [{'diary_id': id} for id in ['private', 'missing', 'shared']],
            'stars': [star('private', 'private'), star('missing', None), star('shared', 'friends')]}
    monkeypatch.setattr(groups, 'supabase', DB(data))
    monkeypatch.setattr(groups, '_assert_member', lambda *args: None)
    monkeypatch.setattr(groups, '_nicknames', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_effects', lambda *args: {})
    calls = []
    monkeypatch.setattr(groups.ai_client, 'planet_visuals', lambda contents: calls.extend(contents))
    assert [row.diary_id for row in groups.group_stars('g1', 'friend')] == ['shared']
    assert calls == ['shared']


def test_changing_to_private_removes_existing_group_tags(monkeypatch):
    existing = {'id': _DID, 'user_id': 'owner', 'content': 'shared', 'visibility': 'friends', 'photo_url': None, 'created_at': '2026-11-15T00:00:00Z'}
    data = {'diaries': [{**existing, 'visibility': 'private'}]}
    monkeypatch.setattr(diaries, 'supabase', DB(data))
    monkeypatch.setattr(diaries, '_get_owned_diary', lambda *args: existing)
    monkeypatch.setattr(diaries, '_is_editable_today', lambda *args: True)
    monkeypatch.setattr(diaries, '_with_signed_photo_url', lambda row: row)
    diaries.update_diary(_DID, DiaryUpdate(visibility='private'), 'owner')
    assert data['deleted'] == 'diary_groups'
    assert data['deleted_id'] == _DID
    assert data['update']['visibility'] == 'private'
