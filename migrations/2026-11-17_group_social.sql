-- 사용자가 테스트 DB에서 검토·적용한 뒤 배포합니다. 기존 일기/코인 데이터는 변경하지 않습니다.
begin;
create table if not exists public.group_messages (
 id bigint generated always as identity primary key,
 group_id uuid not null references public.groups(id) on delete cascade,
 sender_id uuid references auth.users(id) on delete set null,
 client_id uuid not null, body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(), unique(group_id,sender_id,client_id)
);
create index if not exists group_messages_page on public.group_messages(group_id,id desc);
create table if not exists public.group_social_state (
 group_id uuid not null references public.groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 initialized_at timestamptz not null default now(), last_message_id bigint not null default 0,
 primary key(group_id,user_id)
);
create table if not exists public.group_diary_reads (
 group_id uuid not null references public.groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 diary_id uuid not null references public.diaries(id) on delete cascade,
 read_at timestamptz not null default now(), primary key(group_id,user_id,diary_id)
);
create table if not exists public.diary_hearts (
 diary_id uuid not null references public.diaries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(diary_id,user_id)
);
create table if not exists public.group_notifications (
 id bigint generated always as identity primary key,
 group_id uuid not null references public.groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('chat','diary')), source_id text not null,
 created_at timestamptz not null default now(), unique(user_id,group_id,kind,source_id)
);
create table if not exists public.group_push_devices (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 secret_hash text not null, platform text not null check(platform in ('web','expo')),
 subscription jsonb not null, active boolean not null default true,
 updated_at timestamptz not null default now()
);
create table if not exists public.group_push_deliveries (
 notification_id bigint not null references public.group_notifications(id) on delete cascade,
 device_id uuid not null references public.group_push_devices(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
 attempts integer not null default 0, retry_at timestamptz not null default now(),
 primary key(notification_id,device_id)
);
do $$ declare t text; begin
 foreach t in array array['group_messages','group_social_state','group_diary_reads','diary_hearts','group_notifications','group_push_devices','group_push_deliveries'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.group_messages_id_seq, public.group_notifications_id_seq to service_role;

-- Authenticated API supplies p_user from the verified access token, never from request JSON.
create or replace function public.group_social(p_user uuid,p_group uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_diary uuid; v_id bigint; v_body text; v_row group_messages; v_day date;
 v_start timestamptz; v_total integer; v_done integer; v_result jsonb;
begin
 perform 1 from group_members where group_id=p_group and user_id=p_user for share;
 if not found then raise exception 'group_not_found' using errcode='P0001'; end if;
 insert into group_social_state(group_id,user_id,last_message_id)
 values(p_group,p_user,coalesce((select max(id) from group_messages where group_id=p_group),0)) on conflict do nothing;
 if p_action='snapshot' then
  v_day=(now() at time zone 'Asia/Seoul')::date;
  v_start=v_day::timestamp at time zone 'Asia/Seoul';
  select count(*) into v_total from group_members where group_id=p_group;
  select count(distinct d.user_id) into v_done from diary_groups dg join diaries d on d.id=dg.diary_id
   join group_members gm on gm.group_id=p_group and gm.user_id=d.user_id
   where dg.group_id=p_group and d.visibility in ('friends','public') and d.created_at>=v_start and d.created_at<v_start+interval '1 day';
  return jsonb_build_object(
   'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',gm.user_id,'nickname',coalesce(p.nickname,'멤버'),
    'bio',coalesce(p.bio,''),'avatar_path',p.avatar_path) order by gm.joined_at)
    from group_members gm left join profiles p on p.user_id=gm.user_id where gm.group_id=p_group),'[]'::jsonb),
   'diary_ids',coalesce((select jsonb_agg(d.id) from diary_groups dg join diaries d on d.id=dg.diary_id
    join group_members gm on gm.group_id=p_group and gm.user_id=d.user_id
    where dg.group_id=p_group and d.visibility in ('friends','public')),'[]'::jsonb),
   'unread_diary_ids',coalesce((select jsonb_agg(d.id) from diary_groups dg join diaries d on d.id=dg.diary_id
    join group_members gm on gm.group_id=p_group and gm.user_id=d.user_id
    where dg.group_id=p_group and d.user_id<>p_user and d.visibility in ('friends','public')
    and d.created_at>(select initialized_at from group_social_state where group_id=p_group and user_id=p_user)
    and not exists(select 1 from group_diary_reads r where r.group_id=p_group and r.user_id=p_user and r.diary_id=d.id)),'[]'::jsonb),
   'chat_unread_count',(select count(*) from group_messages m where m.group_id=p_group and m.sender_id is distinct from p_user
    and m.id>(select last_message_id from group_social_state where group_id=p_group and user_id=p_user)),
   'quest',jsonb_build_object('id','daily_group_diary','day',v_day,'title','함께 오늘의 별 띄우기','completed',v_done,
    'total',v_total,'done',v_total>0 and v_done>=v_total));
 elsif p_action='messages' then
  v_id=coalesce((p_data->>'before')::bigint,9223372036854775807);
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id::text,'sender_id',q.sender_id,'body',q.body,
   'created_at',q.created_at,'nickname',coalesce(p.nickname,'탈퇴한 멤버'),'avatar_path',p.avatar_path) order by q.id),'[]'::jsonb)
   into v_result from (select * from group_messages where group_id=p_group and id<v_id order by id desc limit 50) q
   left join profiles p on p.user_id=q.sender_id;
  return jsonb_build_object('items',v_result,'has_more',exists(select 1 from group_messages where group_id=p_group
   and id<(select min((x->>'id')::bigint) from jsonb_array_elements(v_result) x)));
 elsif p_action='send' then
  v_body=btrim(p_data->>'body');
  if v_body is null or length(v_body) not between 1 and 2000 then raise exception 'invalid_message'; end if;
  perform pg_advisory_xact_lock(hashtext(p_group::text),hashtext(p_user::text));
  select * into v_row from group_messages where group_id=p_group and sender_id=p_user and client_id=(p_data->>'client_id')::uuid;
  if found then
   if v_row.body<>v_body then raise exception 'message_retry_conflict'; end if;
   return jsonb_build_object('id',v_row.id::text);
  end if;
  if (select count(*) from group_messages where sender_id=p_user and created_at>now()-interval '1 minute')>=60 then raise exception 'message_rate_limit'; end if;
  insert into group_messages(group_id,sender_id,client_id,body) values(p_group,p_user,(p_data->>'client_id')::uuid,v_body) returning id into v_id;
  return jsonb_build_object('id',v_id::text);
 elsif p_action='read_chat' then
  v_id=least((p_data->>'message_id')::bigint,coalesce((select max(id) from group_messages where group_id=p_group),0));
  update group_social_state set last_message_id=greatest(last_message_id,coalesce(v_id,0)) where group_id=p_group and user_id=p_user;
  return '{}'::jsonb;
 elsif p_action in ('read_diary','heart','heart_state') then
  v_diary=(p_data->>'diary_id')::uuid;
  perform 1 from diary_groups dg join diaries d on d.id=dg.diary_id
   join group_members gm on gm.group_id=p_group and gm.user_id=d.user_id
   where dg.group_id=p_group and d.id=v_diary and d.visibility in ('friends','public');
  if not found then raise exception 'diary_not_found'; end if;
  if p_action='read_diary' then
   insert into group_diary_reads(group_id,user_id,diary_id) values(p_group,p_user,v_diary) on conflict do nothing;
   return '{}'::jsonb;
  elsif p_action='heart' then
   if p_data->>'liked'='true' then insert into diary_hearts(diary_id,user_id) values(v_diary,p_user) on conflict do nothing;
   else delete from diary_hearts where diary_id=v_diary and user_id=p_user; end if;
  end if;
  -- Deliberately expose only aggregate count and this viewer's selection, never identities.
  return jsonb_build_object('count',(select count(*) from diary_hearts where diary_id=v_diary),
    'liked',exists(select 1 from diary_hearts where diary_id=v_diary and user_id=p_user));
 else raise exception 'invalid_action'; end if;
end $$;
revoke all on function public.group_social(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.group_social(uuid,uuid,text,jsonb) to service_role;

create or replace function public.queue_group_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_group uuid; v_author uuid; v_kind text; v_source text;
begin
 if tg_table_name='group_messages' then v_group=new.group_id;v_author=new.sender_id;v_kind='chat';v_source=new.id::text;
 else
  v_group=new.group_id; v_source=new.diary_id::text; v_kind='diary';
  select user_id into v_author from diaries where id=new.diary_id and visibility in ('friends','public');
  if not found then return new; end if;
 end if;
 insert into group_notifications(group_id,user_id,kind,source_id)
 select v_group,user_id,v_kind,v_source from group_members where group_id=v_group and user_id is distinct from v_author
 on conflict do nothing;
 return new;
end $$;
create or replace function public.queue_group_delivery() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 insert into group_push_deliveries(notification_id,device_id)
 select new.id,id from group_push_devices where user_id=new.user_id and active on conflict do nothing;
 return new;
end $$;
drop trigger if exists group_message_notification on public.group_messages;
create trigger group_message_notification after insert on public.group_messages for each row execute function queue_group_notification();
drop trigger if exists group_diary_notification on public.diary_groups;
create trigger group_diary_notification after insert on public.diary_groups for each row execute function queue_group_notification();
drop trigger if exists group_notification_delivery on public.group_notifications;
create trigger group_notification_delivery after insert on public.group_notifications for each row execute function queue_group_delivery();
revoke all on function public.queue_group_notification(), public.queue_group_delivery() from public,anon,authenticated;

create or replace function public.register_group_push(p_user uuid,p_id uuid,p_secret text,p_platform text,p_subscription jsonb,p_active boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not p_active then
  update group_push_devices set active=false,updated_at=now() where id=p_id and user_id=p_user and secret_hash=p_secret;
  return jsonb_build_object('enabled',false);
 end if;
 perform 1 from group_push_devices where id=p_id for update;
 if found and not exists(select 1 from group_push_devices where id=p_id and secret_hash=p_secret) then raise exception 'device_conflict'; end if;
 insert into group_push_devices(id,user_id,secret_hash,platform,subscription,active)
 values(p_id,p_user,p_secret,p_platform,p_subscription,p_active)
 on conflict(id) do update set user_id=p_user,platform=p_platform,subscription=p_subscription,active=p_active,updated_at=now()
 where group_push_devices.secret_hash=p_secret;
 if not found then raise exception 'device_conflict'; end if;
 return jsonb_build_object('enabled',p_active);
end $$;
revoke all on function public.register_group_push(uuid,uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.register_group_push(uuid,uuid,text,text,jsonb,boolean) to service_role;

create or replace function public.claim_group_push_jobs(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; begin
 update group_push_deliveries set state='failed' where state='sending' and attempts>=5 and retry_at<now();
 with candidates as (
  select d.notification_id,d.device_id from group_push_deliveries d
  where ((d.state='pending' and d.retry_at<=now()) or (d.state='sending' and d.retry_at<now())) and d.attempts<5
  order by d.notification_id for update skip locked limit least(greatest(p_limit,1),100)
 ), claimed as (
  update group_push_deliveries d set state='sending',attempts=attempts+1,retry_at=now()+interval '5 minutes'
  from candidates c where d.notification_id=c.notification_id and d.device_id=c.device_id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('notification_id',c.notification_id::text,'device_id',c.device_id,
  'attempts',c.attempts,'kind',n.kind,'source_id',n.source_id,'group_id',n.group_id,'user_id',n.user_id,
  'platform',p.platform,'subscription',p.subscription,
  'valid',p.active and p.user_id=n.user_id and exists(select 1 from group_members gm where gm.group_id=n.group_id and gm.user_id=n.user_id)
    and (n.kind<>'diary' or exists(select 1 from diary_groups dg join diaries di on di.id=dg.diary_id
       where dg.group_id=n.group_id and dg.diary_id::text=n.source_id and di.visibility in ('friends','public'))))), '[]'::jsonb)
 into result from claimed c join group_notifications n on n.id=c.notification_id join group_push_devices p on p.id=c.device_id;
 return result;
end $$;
revoke all on function public.claim_group_push_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_group_push_jobs(integer) to service_role;
commit;
