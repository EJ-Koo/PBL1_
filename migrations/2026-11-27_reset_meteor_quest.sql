-- Apply after 2026-11-27_meteor_quest.sql.
begin;
set local lock_timeout = '5s';

alter table public.meteor_quest_state
  add column if not exists cycle integer not null default 0 check (cycle >= 0);

drop function if exists public.sync_meteor_quest(uuid, date, integer);
create or replace function public.sync_meteor_quest(
  p_user uuid, p_day date default null, p_meteor integer default null, p_cycle integer default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_cycle integer;
  v_mask integer;
  v_new_mask integer;
  v_awarded integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('meteor-quest:' || p_user::text, 0));
  insert into meteor_quest_state(user_id, quest_day) values (p_user, v_day)
    on conflict do nothing;
  select cycle, cleared_mask into v_cycle, v_mask from meteor_quest_state
    where user_id = p_user and quest_day = v_day for update;

  -- Older clients omit the cycle. Current clients can reject taps from before reset.
  if p_meteor between 1 and 3 and p_day = v_day and (p_cycle is null or p_cycle = v_cycle) then
    v_new_mask := v_mask | (1 << (p_meteor - 1));
    if v_new_mask <> v_mask then
      update meteor_quest_state set cleared_mask = v_new_mask
        where user_id = p_user and quest_day = v_day;
      if v_new_mask = 7 then
        perform adjust_coins(p_user, 3, 'quest', 'daily_meteors:' || v_day::text || ':' || v_cycle::text);
        v_awarded := 3;
      end if;
    end if;
    v_mask := v_new_mask;
  end if;

  return json_build_object(
    'day', v_day, 'cycle', v_cycle, 'awarded', v_awarded,
    'cleared', array(select id from generate_series(1, 3) as meteor(id)
      where (v_mask & (1 << (id - 1))) <> 0 order by id)
  );
end;
$$;

create or replace function public.reset_daily_quests(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_diary json;
  v_day date;
begin
  perform pg_advisory_xact_lock(hashtextextended('meteor-quest:' || p_user::text, 0));
  -- The diary function checks the developer flag before any reset is committed.
  v_diary := sync_daily_quest(p_user, true);
  v_day := (v_diary->>'day')::date;
  insert into meteor_quest_state as state(user_id, quest_day, cycle)
    values (p_user, v_day, 1)
    on conflict (user_id, quest_day) do update
      set cleared_mask = 0, cycle = state.cycle + 1;
  return v_diary;
end;
$$;

revoke all on function public.sync_meteor_quest(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.sync_meteor_quest(uuid, date, integer, integer) to service_role;
revoke all on function public.reset_daily_quests(uuid) from public, anon, authenticated;
grant execute on function public.reset_daily_quests(uuid) to service_role;
commit;
