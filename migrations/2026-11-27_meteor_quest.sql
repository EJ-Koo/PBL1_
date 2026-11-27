begin;

create table if not exists public.meteor_quest_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_day date not null,
  cleared_mask integer not null default 0 check (cleared_mask between 0 and 7),
  primary key (user_id, quest_day)
);

alter table public.meteor_quest_state enable row level security;
revoke all on public.meteor_quest_state from public, anon, authenticated;
grant all on public.meteor_quest_state to service_role;

create or replace function public.sync_meteor_quest(
  p_user uuid, p_day date default null, p_meteor integer default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_mask integer := 0;
  v_new_mask integer;
  v_awarded integer := 0;
begin
  if p_meteor between 1 and 3 and p_day = v_day then
    insert into meteor_quest_state(user_id, quest_day) values (p_user, v_day)
      on conflict do nothing;
    select cleared_mask into v_mask from meteor_quest_state
      where user_id = p_user and quest_day = v_day for update;
    v_new_mask := v_mask | (1 << (p_meteor - 1));
    if v_new_mask <> v_mask then
      update meteor_quest_state set cleared_mask = v_new_mask
        where user_id = p_user and quest_day = v_day;
      if v_new_mask = 7 then
        perform adjust_coins(p_user, 3, 'quest', 'daily_meteors:' || v_day::text);
        v_awarded := 3;
      end if;
    end if;
    v_mask := v_new_mask;
  else
    select coalesce((select cleared_mask from meteor_quest_state
      where user_id = p_user and quest_day = v_day), 0) into v_mask;
  end if;

  return json_build_object(
    'day', v_day, 'awarded', v_awarded,
    'cleared', array(select id from generate_series(1, 3) as meteor(id)
      where (v_mask & (1 << (id - 1))) <> 0 order by id)
  );
end;
$$;

revoke all on function public.sync_meteor_quest(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.sync_meteor_quest(uuid, date, integer) to service_role;
commit;
