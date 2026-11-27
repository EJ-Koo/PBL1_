from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.routers import quests, diaries
from app.schemas.diary import DiaryCreate
from app.schemas.quest import DailyQuestStatus, MeteorQuestHit


def status(**changes):
    return {'quest_id': 'daily_diary', 'day': '2026-11-15', 'cycle': 0, 'completed': True,
            'progress': 1, 'target': 1, 'reward': 5, 'awarded': 5, 'coins': 1004,
            'reset_allowed': True, 'after_reset': False, 'next_reset_at': '2026-11-15T15:00:00Z', **changes}


def test_sync_calls_atomic_rpc_for_authenticated_owner_only(monkeypatch):
    fake = Mock()
    fake.rpc.return_value.execute.return_value.data = status()
    monkeypatch.setattr(quests, 'supabase', fake)
    result = quests.sync_my_quest(user_id='owner-a')
    fake.rpc.assert_called_once_with('sync_daily_quest', {'p_user': 'owner-a', 'p_reset': False})
    assert result.awarded == 5 and result.completed is True


def test_reset_does_not_accept_reward_amount_or_other_user(monkeypatch):
    fake = Mock()
    fake.rpc.return_value.execute.return_value.data = status(cycle=1, progress=0, completed=False, awarded=0, after_reset=True)
    monkeypatch.setattr(quests, 'supabase', fake)
    result = quests.reset_my_quest(user_id='owner-a')
    fake.rpc.assert_called_once_with('reset_daily_quests', {'p_user': 'owner-a'})
    assert result.cycle == 1 and result.awarded == 0 and result.coins == 1004


@pytest.mark.parametrize('code,message,http', [('P0001', 'test_reset_disabled', 403), ('PGRST202', 'missing rpc', 503), ('42P01', 'missing table', 503), ('XX000', 'db failure', 502)])
def test_rpc_errors_are_explained_without_exposing_raw_database_details(monkeypatch, code, message, http):
    fake = Mock()
    fake.rpc.return_value.execute.side_effect = APIError({'code': code, 'message': message, 'details': '', 'hint': ''})
    monkeypatch.setattr(quests, 'supabase', fake)
    with pytest.raises(HTTPException) as exc:
        quests.reset_my_quest('owner-a')
    assert exc.value.status_code == http


def test_network_outage_is_recoverable(monkeypatch):
    fake = Mock()
    fake.rpc.return_value.execute.side_effect = ConnectionError('offline')
    monkeypatch.setattr(quests, 'supabase', fake)
    with pytest.raises(HTTPException) as exc: quests.sync_my_quest('owner-a')
    assert exc.value.status_code == 502


def test_meteor_hit_uses_authenticated_owner_and_retains_quest_day(monkeypatch):
    fake = Mock()
    fake.rpc.return_value.execute.return_value.data = {
        'day': '2026-11-27', 'cleared': [1, 2, 3], 'awarded': 3,
    }
    monkeypatch.setattr(quests, 'supabase', fake)
    hit = MeteorQuestHit.model_validate({'day': '2026-11-27', 'meteor': 3, 'cycle': 2, 'user_id': 'another-user'})
    result = quests.clear_my_meteor(hit, user_id='owner-a')
    fake.rpc.assert_called_once_with('sync_meteor_quest', {
        'p_user': 'owner-a', 'p_day': '2026-11-27', 'p_meteor': 3, 'p_cycle': 2,
    })
    assert result.cleared == [1, 2, 3] and result.awarded == 3


@pytest.mark.parametrize('fail', [False, True])
def test_diary_save_returns_reward_but_does_not_turn_a_quest_outage_into_a_failed_diary(monkeypatch, fail):
    row = {'id': 'diary-1', 'user_id': 'owner-a', 'content': '오늘의 일기', 'created_at': '2026-11-15T01:00:00Z'}
    monkeypatch.setattr(diaries, '_assert_member_of_groups', lambda *_: None)
    monkeypatch.setattr(diaries, '_write_diary', lambda *_: SimpleNamespace(data=[dict(row)]))
    monkeypatch.setattr(diaries, '_create_star_for_diary', lambda *_: None)
    monkeypatch.setattr(diaries, '_tag_diary_groups', lambda *_: None)
    monkeypatch.setattr(diaries, '_with_signed_photo_url', lambda value: dict(value))
    fake = Mock()
    if fail: fake.side_effect = HTTPException(status_code=503, detail='Quest unavailable')
    else: fake.return_value = DailyQuestStatus.model_validate(status())
    monkeypatch.setattr(diaries, 'sync_daily_quest', fake)
    result = diaries.create_diary(DiaryCreate(content='오늘의 일기'), 'owner-a')
    assert result['id'] == 'diary-1'
    fake.assert_called_once_with('owner-a')
    assert (result['quest_result'] is None) == fail
    if not fail: assert result['quest_result']['awarded'] == 5
