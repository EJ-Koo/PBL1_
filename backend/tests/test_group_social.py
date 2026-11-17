from uuid import UUID,uuid4
from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from app.routers import group_social as social

G=UUID('00000000-0000-0000-0000-000000000001')
D=UUID('00000000-0000-0000-0000-000000000002')
class DB:
    def __init__(self,data=None,error=None):self.data=data;self.error=error;self.calls=[]
    def rpc(self,name,payload):self.calls.append((name,payload));return self
    def execute(self):
        if self.error:raise RuntimeError(self.error)
        return SimpleNamespace(data=self.data)

def test_verified_user_is_forwarded_and_body_is_trimmed(monkeypatch):
    db=DB({'id':'1'});monkeypatch.setattr(social,'supabase',db)
    draft=social.MessageDraft(body=' hello ',client_id=uuid4())
    social.send_message(G,draft,'verified-user')
    assert db.calls[0][1]['p_user']=='verified-user'
    assert db.calls[0][1]['p_group']==str(G)
    assert db.calls[0][1]['p_data']['body']=='hello'

@pytest.mark.parametrize('value',['','   ','x'*2001])
def test_message_limits(value):
    with pytest.raises(ValidationError):social.MessageDraft(body=value,client_id=uuid4())

def test_anonymous_heart_contract_never_returns_identities(monkeypatch):
    monkeypatch.setattr(social,'supabase',DB({'count':2,'liked':True,'users':['private-id']}))
    assert social.heart_state(G,D,'me')=={'count':2,'liked':True}

@pytest.mark.parametrize('code,status',[('group_not_found',404),('diary_not_found',404),('message_retry_conflict',409),('message_rate_limit',429),('device_conflict',409),('secret-db-error',503)])
def test_errors_are_mapped_without_leaking_server_details(monkeypatch,code,status):
    monkeypatch.setattr(social,'supabase',DB(error=code))
    with pytest.raises(HTTPException) as error:social.snapshot(G,'me')
    assert error.value.status_code==status
    assert 'secret-db-error' not in error.value.detail

@pytest.mark.parametrize('endpoint',['https://evil.example/push','http://127.0.0.1/push','https://fcm.googleapis.com.evil.example/push','https://user:password@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x'])
def test_push_cannot_request_arbitrary_urls(endpoint):
    assert not social.valid_push_endpoint(endpoint)

def test_valid_push_registration_strips_extra_data_and_hashes_proof(monkeypatch):
    db=DB({'enabled':True});monkeypatch.setattr(social,'supabase',db)
    draft=social.PushDevice(id=uuid4(),secret='a'*40,platform='web',subscription={'endpoint':'https://fcm.googleapis.com/x','keys':{'p256dh':'p'*40,'auth':'a'*20},'extra':'discard'})
    social.register_device(draft,'me')
    payload=db.calls[0][1]
    assert payload['p_secret']!='a'*40 and len(payload['p_secret'])==64
    assert 'extra' not in payload['p_subscription']

def test_read_cursor_overflow_is_rejected():
    with pytest.raises(HTTPException) as error:social.read_chat(G,social.ReadChat(message_id='9223372036854775808'),'me')
    assert error.value.status_code==422
