from types import SimpleNamespace
from uuid import UUID
import pytest
from fastapi import HTTPException
from app.routers import group_social as social
from scripts import group_push_worker as worker

DEVICE=UUID('00000000-0000-4000-8000-000000000001')

class QueryDB:
    def __init__(self, tables): self.tables=tables; self.calls=[]
    def table(self,name): return Query(self,name)
class Query:
    def __init__(self,db,table):self.db=db;self.table=table
    def __getattr__(self,name):
        def method(*args,**kwargs):self.db.calls.append((self.table,name,args,kwargs));return self
        return method
    def execute(self):
        data=self.db.tables[self.table]
        if isinstance(data,Exception):raise data
        return SimpleNamespace(data=data)

def test_status_is_scoped_to_verified_owner_and_returns_no_subscription_secrets(monkeypatch):
    db=QueryDB({'group_push_devices':[{'id':str(DEVICE),'active':True,'subscription':'secret'}],
      'group_notifications':[{'id':1},{'id':2}], 'group_push_deliveries':[{'state':'pending','attempts':2},{'state':'sent','attempts':1}]})
    monkeypatch.setattr(social,'supabase',db)
    result=social.push_status(DEVICE,'verified-user')
    assert result=={'registered':True,'recent_notifications':2,'pending':1,'sending':0,'sent':1,'failed':0,'max_attempts':2}
    assert ('group_push_devices','eq',('user_id','verified-user'),{}) in db.calls
    assert ('group_notifications','eq',('user_id','verified-user'),{}) in db.calls
    assert ('group_push_deliveries','eq',('device_id',str(DEVICE)),{}) in db.calls
    assert 'secret' not in str(result)

def test_other_account_device_does_not_read_notification_history(monkeypatch):
    db=QueryDB({'group_push_devices':[]});monkeypatch.setattr(social,'supabase',db)
    result=social.push_status(DEVICE,'other-user')
    assert not result['registered']
    assert all(call[0]=='group_push_devices' for call in db.calls)

def test_status_errors_hide_database_details(monkeypatch):
    monkeypatch.setattr(social,'supabase',QueryDB({'group_push_devices':RuntimeError('secret-key')}))
    with pytest.raises(HTTPException) as error:social.push_status(DEVICE,'me')
    assert error.value.status_code==503
    assert 'secret-key' not in error.value.detail

def test_worker_logs_bounded_error_code_and_retries_without_leaking_provider_exception(monkeypatch,capsys):
    class ProviderError(Exception):response=SimpleNamespace(status_code=403)
    class WorkerDB:
        def __init__(self):self.update_value=None
        def rpc(self,*args,**kwargs):return SimpleNamespace(execute=lambda:SimpleNamespace(data=[{'notification_id':'1','device_id':str(DEVICE),'attempts':1}]))
        def table(self,*args):return self
        def update(self,value):self.update_value=value;return self
        def eq(self,*args):return self
        def execute(self):return SimpleNamespace(data=[])
    db=WorkerDB();monkeypatch.setattr(worker,'supabase',db)
    def rejected(_job):raise ProviderError('private-key-and-subscription-endpoint')
    monkeypatch.setattr(worker,'send',rejected)
    assert worker.tick()==1
    assert db.update_value['state']=='pending'
    output=capsys.readouterr().out
    assert 'push_auth_rejected' in output and 'retry=1' in output
    assert 'private-key' not in output and 'subscription-endpoint' not in output

@pytest.mark.parametrize('error,code',[(RuntimeError('web_push_not_configured'),'web_push_not_configured'),(ValueError('secret'),'push_key_or_subscription_invalid'),(ModuleNotFoundError('hidden-path'),'push_dependency_missing')])
def test_worker_error_codes_are_actionable_and_do_not_echo_secrets(error,code):
    assert worker.failure_code(error)==code
