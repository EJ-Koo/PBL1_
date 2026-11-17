"""Run from backend/: python -m scripts.group_push_worker [--once]. No keys in output."""
import argparse
import json
import time
from datetime import datetime,timedelta,timezone
import httpx
from app.config import settings
from app.db import supabase
from app.routers.group_social import valid_push_endpoint

def send(job):
    if not job.get('valid'):return 'skip'
    data={key:job[key] for key in ('user_id','group_id','source_id','kind')}
    body='그룹에 새 메시지가 도착했어요.' if job['kind']=='chat' else '그룹에 새로운 별이 생겼어요.'
    if job['platform']=='web':
        if not settings.web_push_private_key or not settings.web_push_subject:raise RuntimeError('web_push_not_configured')
        if not valid_push_endpoint(job['subscription'].get('endpoint','')):return 'invalid'
        from pywebpush import webpush,WebPushException
        try:
            webpush(subscription_info=job['subscription'],data=json.dumps(data),vapid_private_key=settings.web_push_private_key,
              vapid_claims={'sub':settings.web_push_subject},timeout=10,ttl=600)
        except WebPushException as error:
            if error.response is not None and error.response.status_code in (404,410):return 'invalid'
            raise
    else:
        response=httpx.post('https://exp.host/--/api/v2/push/send',json={'to':job['subscription']['token'],
          'title':'오늘의 별일','body':body,'data':data,'sound':'default','channelId':'groups'},timeout=10)
        response.raise_for_status(); result=response.json().get('data',{})
        if result.get('details',{}).get('error')=='DeviceNotRegistered':return 'invalid'
        if result.get('status')!='ok':raise RuntimeError('expo_push_failed')
    return 'sent'

def tick():
    jobs=supabase.rpc('claim_group_push_jobs',{'p_limit':30}).execute().data or []
    for job in jobs:
        try:
            status=send(job)
            if status=='invalid':supabase.table('group_push_devices').update({'active':False}).eq('id',job['device_id']).execute()
            update={'state':'sent' if status=='sent' else 'failed'}
        except Exception:
            # Do not log endpoint, tokens, push credentials or message contents.
            update={'state':'failed' if job['attempts']>=5 else 'pending',
              'retry_at':(datetime.now(timezone.utc)+timedelta(seconds=min(3600,30*2**job['attempts']))).isoformat()}
        supabase.table('group_push_deliveries').update(update).eq('notification_id',job['notification_id']).eq('device_id',job['device_id']).execute()
    return len(jobs)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');args=parser.parse_args()
    while True:
        try: count=tick()
        except Exception:
            print('Push worker could not reach its queue; check SQL/configuration. No payload logged.')
            if args.once:raise SystemExit(1)
        if args.once:break
        time.sleep(5)
