from datetime import datetime, timedelta, timezone
from app.routers import groups

class Query:
    def __init__(self, rows): self.rows = rows
    def select(self, *args): return self
    def in_(self, *args): return self
    def gte(self, *args): return self
    def lt(self, *args): return self
    def execute(self): return type('Result', (), {'data': self.rows})()

def test_summary_is_scoped_to_shared_today_and_latest_member_color(monkeypatch):
    now = datetime.now(timezone(timedelta(hours=9)))
    def row(group, user, created, visibility='friends', color='#123456'):
        return {'group_id': group, 'diaries': {'user_id': user, 'created_at': created.isoformat(), 'visibility': visibility, 'stars': [{'color': color}]}}
    rows = [row('a', 'friend', now.replace(hour=0, minute=0, second=0, microsecond=0), color='#111111'),
            row('a', 'friend', now, color='#ffaa33'), row('b', 'friend', now, color='#3344ff'),
            row('a', 'private', now, 'private'), row('a', 'old', now-timedelta(days=1))]
    monkeypatch.setattr(groups, 'supabase', type('DB', (), {'table': lambda self, name: Query(rows)})())
    day, result = groups._shared_activity(['a', 'b'])
    assert day == now.date().isoformat()
    assert result[('a', 'friend')][1] == '#ffaa33'
    assert result[('b', 'friend')][1] == '#3344ff'
    assert ('a', 'private') not in result
    assert ('a', 'old') not in result

def test_summary_outage_is_unknown_not_false_completion(monkeypatch):
    monkeypatch.setattr(groups, 'supabase', type('DB', (), {'table': lambda *args: (_ for _ in ()).throw(RuntimeError('offline'))})())
    assert groups._shared_activity(['a']) == (None, {})
