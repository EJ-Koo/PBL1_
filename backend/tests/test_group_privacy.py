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
    monkeypatch.setattr(groups, 'applied_surfaces', lambda *args: {})
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


def test_shared_diary_returns_its_author_profile_not_the_viewer(monkeypatch):
    db = _view_db(diary_groups=[{'diary_id': _DID, 'group_id': 'g1'}],
                  group_members=[{'group_id': 'g1', 'user_id': 'friend'}],
                  profiles=[{'user_id': 'owner', 'nickname': '작성자', 'avatar_path': 'owner/profile/a.png'},
                            {'user_id': 'friend', 'nickname': '열람자'}])
    monkeypatch.setattr(diaries, 'supabase', _ViewFakeSupabase(db))
    monkeypatch.setattr(diaries, '_with_signed_photo_url', lambda row: {**row})
    calls = []
    def shape(row, user_id):
        calls.append(user_id)
        return {**row, 'avatar_url': 'https://example.invalid/signed-avatar'}
    monkeypatch.setattr(diaries, 'shape_profile', shape)
    result = diaries.get_diary(_DID, 'friend')
    assert result['author_profile'] == {'nickname': '작성자', 'avatar_url': 'https://example.invalid/signed-avatar'}
    assert calls == ['owner']
    assert 'avatar_path' not in result['author_profile']


def test_private_diary_does_not_load_author_profile_for_other_members(monkeypatch):
    db = _view_db(diary_groups=[{'diary_id': _DID, 'group_id': 'g1'}], group_members=[{'group_id': 'g1', 'user_id': 'friend'}])
    db['diaries'][0]['visibility'] = 'private'
    monkeypatch.setattr(diaries, 'supabase', _ViewFakeSupabase(db))
    monkeypatch.setattr(diaries, 'shape_profile', lambda *args: pytest.fail('must not sign a private diary author avatar'))
    with pytest.raises(HTTPException):
        diaries.get_diary(_DID, 'friend')


@pytest.mark.parametrize('topic', ['travel', 'relationship', 'study_achievement', 'rest_daily', 'challenge_activity', 'other', None])
def test_group_stars_preserves_each_authors_saved_diary_topic(monkeypatch, topic):
    data = {'diary_groups': [{'diary_id': 'one'}], 'stars': [{
        'diary_id': 'one', 'diaries': {'id': 'one', 'user_id': 'another-author', 'content': 'shared',
            'created_at': '2026-11-25T00:00:00Z', 'visibility': 'friends', 'topic': topic},
        'x': 1, 'y': 2, 'z': 3, 'color': '#fff', 'size': .3, 'brightness': 1,
    }]}
    monkeypatch.setattr(groups, 'supabase', DB(data))
    monkeypatch.setattr(groups, '_assert_member', lambda *args: None)
    monkeypatch.setattr(groups, '_nicknames', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_effects', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_surfaces', lambda *args: {})
    monkeypatch.setattr(groups.ai_client, 'planet_visuals', lambda *args: None)
    assert groups.group_stars('g1', 'viewer')[0].topic == topic


def test_missing_group_topic_column_falls_back_without_exposing_private_diaries(monkeypatch):
    data = {'diary_groups': [{'diary_id': 'shared'}], 'stars': [{
        'diary_id': 'shared', 'diaries': {'content': 'shared', 'created_at': '2026-11-25T00:00:00Z',
            'user_id': 'owner', 'visibility': 'friends'},
        'x': 1, 'y': 2, 'z': 3, 'color': '#fff', 'size': .3, 'brightness': 1,
    }]}
    selects = []
    class MissingTopicQuery(Query):
        def select(self, columns):
            selects.append(columns)
            if self.table == 'stars' and ', topic' in columns:
                raise RuntimeError('missing topic column')
            return self
    class MissingTopicDB:
        def table(self, name): return MissingTopicQuery(name, data)
    monkeypatch.setattr(groups, 'supabase', MissingTopicDB())
    monkeypatch.setattr(groups, '_assert_member', lambda *args: None)
    monkeypatch.setattr(groups, '_nicknames', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_effects', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_surfaces', lambda *args: {})
    monkeypatch.setattr(groups.ai_client, 'planet_visuals', lambda *args: None)
    monkeypatch.setattr(groups, 'topic_column_ready', lambda: True)
    monkeypatch.setattr(groups, 'is_missing_column', lambda error, column: column == 'topic')
    marked = []
    monkeypatch.setattr(groups, 'mark_topic_column_missing', lambda: marked.append(True))
    rows = groups.group_stars('g1', 'friend')
    assert rows[0].topic is None
    assert marked == [True]
    assert any(', topic' in columns for columns in selects)
    assert any('visibility)' in columns for columns in selects)


def test_group_legacy_topics_are_scoped_to_authors_and_private_rows_are_excluded(monkeypatch):
    from app.routers import stars

    def row(diary_id, author, topic=None, visibility='friends'):
        return {'diary_id': diary_id, 'diaries': {'id': diary_id, 'user_id': author,
                'content': diary_id, 'created_at': '2020-01-01T00:00:00Z',
                'visibility': visibility, 'topic': topic},
                'x': 1, 'y': 2, 'z': 3, 'color': '#fff', 'size': .3, 'brightness': 1}

    data = {'diary_groups': [{'diary_id': key} for key in ['a', 'b', 'saved', 'private']],
            'stars': [row('a', 'author-a'), row('b', 'author-b'),
                      row('saved', 'author-a', 'travel'), row('private', 'author-a', visibility='private')]}
    monkeypatch.setattr(groups, 'supabase', DB(data))
    monkeypatch.setattr(groups, '_assert_member', lambda *args: None)
    monkeypatch.setattr(groups, '_nicknames', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_effects', lambda *args: {})
    monkeypatch.setattr(groups, 'applied_surfaces', lambda *args: {})
    monkeypatch.setattr(groups.ai_client, 'planet_visuals', lambda *args: None)
    monkeypatch.setattr(stars.settings, 'topic_ai_fallback', True)
    calls = []

    def legacy(author, ids, allowed):
        calls.append((author, ids))
        return {'a': 'other'} if author == 'author-a' else {'b': 'rest_daily'}

    monkeypatch.setattr(stars.ai_client, 'diary_topics', legacy)
    result = groups.group_stars('g1', 'late-joining-viewer')
    # Old shared diaries remain visible; there is no join-date cutoff.
    assert {entry.diary_id: entry.topic for entry in result} == {
        'a': 'other', 'b': 'rest_daily', 'saved': 'travel'}
    assert sorted(calls) == [('author-a', ['a']), ('author-b', ['b'])]
