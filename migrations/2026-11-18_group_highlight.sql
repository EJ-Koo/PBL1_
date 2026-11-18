-- Apply after 2026-11-17_group_social.sql. Include own new shared stars; retain read receipts and access checks.
begin;
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
    where dg.group_id=p_group and d.visibility in ('friends','public')
    and (d.created_at>(select initialized_at from group_social_state where group_id=p_group and user_id=p_user)
      or (d.user_id=p_user and d.created_at>=now()-interval '20 seconds'))
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
commit;
