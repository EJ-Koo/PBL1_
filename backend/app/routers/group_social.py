"""Group collaboration API. Membership and atomic writes are enforced by SQL RPC."""
import hashlib
from typing import Literal
from uuid import UUID
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from app.db import supabase
from app.dependencies import get_current_user_id
from app.routers.profiles import _shape as shape_profile
from app.config import settings

router = APIRouter(tags=['group-social'])

def rpc(name: str, values: dict):
    try:
        data = supabase.rpc(name, values).execute().data
        return data
    except Exception as error:
        message = str(error)
        for code, status, detail in [('group_not_found',404,'그룹을 찾을 수 없어요.'),
          ('diary_not_found',404,'공유된 일기를 찾을 수 없어요.'),
          ('message_retry_conflict',409,'같은 메시지 요청으로 다른 내용을 전송할 수 없어요.'),
          ('message_rate_limit',429,'메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 보내주세요.'),
          ('device_conflict',409,'이 기기의 알림 등록을 다시 확인해주세요.')]:
            if code in message: raise HTTPException(status,detail) from None
        raise HTTPException(503,'그룹 기능을 연결하지 못했어요. 잠시 후 다시 시도해주세요.') from None

def action(user: str, group: UUID, name: str, data=None):
    return rpc('group_social',{'p_user':user,'p_group':str(group),'p_action':name,'p_data':data or {}})

def avatars(rows):
    for row in rows:
        uid=row.get('user_id') or row.get('sender_id')
        shaped=shape_profile(row,uid) if uid else {'avatar_url':None}
        row.pop('avatar_path',None)
        row['avatar_url']=shaped.get('avatar_url')
    return rows

@router.get('/groups/{group_id}/social')
def snapshot(group_id: UUID,user: str=Depends(get_current_user_id)):
    data=action(user,group_id,'snapshot')
    data['members']=avatars(data.get('members',[]))
    return data

@router.get('/groups/{group_id}/messages')
def messages(group_id: UUID,before: int | None=Query(None,gt=0,le=9223372036854775807),user: str=Depends(get_current_user_id)):
    data=action(user,group_id,'messages',{'before':before} if before else {})
    data['items']=avatars(data.get('items',[]))
    return data

class MessageDraft(BaseModel):
    body: str=Field(min_length=1,max_length=2000)
    client_id: UUID
    @model_validator(mode='after')
    def trim(self):
        self.body=self.body.strip()
        if not self.body: raise ValueError('메시지를 입력해주세요.')
        return self

@router.post('/groups/{group_id}/messages')
def send_message(group_id: UUID,draft: MessageDraft,user: str=Depends(get_current_user_id)):
    return action(user,group_id,'send',{'body':draft.body,'client_id':str(draft.client_id)})

class ReadChat(BaseModel):
    message_id: str=Field(pattern=r'^[1-9][0-9]{0,18}$')

@router.put('/groups/{group_id}/messages/read')
def read_chat(group_id: UUID,draft: ReadChat,user: str=Depends(get_current_user_id)):
    if int(draft.message_id)>9223372036854775807: raise HTTPException(422,'메시지 번호를 확인해주세요.')
    return action(user,group_id,'read_chat',{'message_id':draft.message_id})

@router.put('/groups/{group_id}/diaries/{diary_id}/read')
def read_diary(group_id: UUID,diary_id: UUID,user: str=Depends(get_current_user_id)):
    return action(user,group_id,'read_diary',{'diary_id':str(diary_id)})

class Heart(BaseModel):
    liked: bool

def heart_result(value):
    # Even if a future RPC accidentally returns more, do not disclose who liked.
    return {'count':max(0,int(value.get('count',0))),'liked':bool(value.get('liked',False))}

@router.get('/groups/{group_id}/diaries/{diary_id}/heart')
def heart_state(group_id: UUID,diary_id: UUID,user: str=Depends(get_current_user_id)):
    return heart_result(action(user,group_id,'heart_state',{'diary_id':str(diary_id)}))

@router.put('/groups/{group_id}/diaries/{diary_id}/heart')
def set_heart(group_id: UUID,diary_id: UUID,draft: Heart,user: str=Depends(get_current_user_id)):
    return heart_result(action(user,group_id,'heart',{'diary_id':str(diary_id),'liked':draft.liked}))

def valid_push_endpoint(endpoint: str) -> bool:
    parsed=urlparse(endpoint)
    host=(parsed.hostname or '').lower()
    allowed=host in ('fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com') or host.endswith('.notify.windows.com')
    return bool(parsed.scheme=='https' and allowed and not parsed.username and not parsed.password and parsed.port in (None,443))

class PushDevice(BaseModel):
    id: UUID
    secret: str=Field(min_length=32,max_length=128)
    platform: Literal['web','expo']
    subscription: dict
    enabled: bool=True
    @model_validator(mode='after')
    def valid(self):
        if self.platform=='web':
            try: valid=valid_push_endpoint(str(self.subscription.get('endpoint','')))
            except ValueError: valid=False
            keys=self.subscription.get('keys',{})
            if not valid or not isinstance(keys,dict) or any(not isinstance(keys.get(key),str) or not 8<=len(keys[key])<=256 for key in ('p256dh','auth')) or len(str(self.subscription.get('endpoint','')))>2048:
                raise ValueError('브라우저 알림 구독을 확인해주세요.')
            self.subscription={'endpoint':self.subscription['endpoint'],'keys':{'p256dh':keys['p256dh'],'auth':keys['auth']}}
        else:
            token=self.subscription.get('token','')
            if not isinstance(token,str) or len(token)>256 or not (token.startswith('ExponentPushToken[') or token.startswith('ExpoPushToken[')) or not token.endswith(']'):
                raise ValueError('모바일 알림 토큰을 확인해주세요.')
        return self

@router.get('/me/group-push/config')
def push_config(user: str=Depends(get_current_user_id)):
    return {'web_public_key':settings.web_push_public_key or None,'mobile_enabled':True}

@router.put('/me/group-push/device')
def register_device(draft: PushDevice,user: str=Depends(get_current_user_id)):
    return rpc('register_group_push',{'p_user':user,'p_id':str(draft.id),'p_secret':hashlib.sha256(draft.secret.encode()).hexdigest(),
      'p_platform':draft.platform,'p_subscription':draft.subscription,'p_active':draft.enabled})


@router.get('/me/group-push/status')
def push_status(device_id: UUID, user: str = Depends(get_current_user_id)):
    """Only this account's installation and aggregate delivery states; never subscriptions or keys."""
    try:
        devices = supabase.table('group_push_devices').select('id,active').eq('user_id', user).eq('id', str(device_id)).execute().data or []
        result = {'registered': any(row.get('active') for row in devices), 'recent_notifications': 0,
                  'pending': 0, 'sending': 0, 'sent': 0, 'failed': 0, 'max_attempts': 0}
        if not devices:
            return result
        notifications = supabase.table('group_notifications').select('id').eq('user_id', user).order('id', desc=True).limit(50).execute().data or []
        result['recent_notifications'] = len(notifications)
        if notifications:
            rows = supabase.table('group_push_deliveries').select('state,attempts').eq('device_id', str(device_id)).in_('notification_id', [row['id'] for row in notifications]).execute().data or []
            for row in rows:
                if row.get('state') in ('pending', 'sending', 'sent', 'failed'):
                    result[row['state']] += 1
                result['max_attempts'] = max(result['max_attempts'], int(row.get('attempts', 0)))
        return result
    except Exception:
        raise HTTPException(503, '알림 상태를 확인하지 못했어요. 백엔드 배포와 DB 설정을 확인해주세요.') from None
