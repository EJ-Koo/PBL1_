-- Supabase SQL Editor의 일반 쿼리에서 사용자가 실행합니다.
-- 선행: 2026-11-07_shop_coins.sql (wallets, coin_logs, ensure_wallet, adjust_coins).
-- allow_test_reset 설정을 자동으로 켜지 않습니다. 관리자 > 설정에서 필요할 때만 켜세요.
begin;

-- 명시적인 기존 설정은 보존하고, 설정 행이 없는 경우에는 안전하게 꺼진 상태로 만듭니다.
insert into public.app_config(key, value) values ('allow_test_reset', 'false'::jsonb)
  on conflict (key) do nothing;

create table if not exists public.daily_quest_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_day date not null,
  cycle integer not null default 0 check (cycle >= 0),
  eligible_after timestamptz,
  primary key (user_id, quest_day)
);

create table if not exists public.daily_quest_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_day date not null,
  cycle integer not null check (cycle >= 0),
  diary_id uuid references public.diaries(id) on delete set null,
  reward integer not null check (reward = 5),
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_day, cycle)
);

alter table public.daily_quest_state enable row level security;
alter table public.daily_quest_claims enable row level security;
revoke all on public.daily_quest_state, public.daily_quest_claims from public, anon, authenticated;
grant all on public.daily_quest_state, public.daily_quest_claims to service_role;

create or replace function public.sync_daily_quest(p_user uuid, p_reset boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now at time zone 'Asia/Seoul')::date;
  v_start timestamptz := v_day::timestamp at time zone 'Asia/Seoul';
  v_end timestamptz := (v_day + 1)::timestamp at time zone 'Asia/Seoul';
  v_cycle integer;
  v_cutoff timestamptz;
  v_diary uuid;
  v_allowed boolean;
  v_complete boolean;
  v_awarded integer := 0;
  v_coins integer;
begin
  insert into daily_quest_state(user_id, quest_day) values (p_user, v_day)
    on conflict (user_id, quest_day) do nothing;
  -- 같은 사용자/한국 날짜의 조회·지급·초기화는 이 행으로 직렬화합니다.
  select cycle, eligible_after into v_cycle, v_cutoff from daily_quest_state
    where user_id = p_user and quest_day = v_day for update;

  select value = 'true'::jsonb into v_allowed from app_config where key = 'allow_test_reset';
  v_allowed := coalesce(v_allowed, false);
  if p_reset then
    if not v_allowed then raise exception 'test_reset_disabled'; end if;
    v_cycle := v_cycle + 1;
    v_cutoff := clock_timestamp();
    update daily_quest_state set cycle = v_cycle, eligible_after = v_cutoff
      where user_id = p_user and quest_day = v_day;
  end if;

  select exists(select 1 from daily_quest_claims
    where user_id = p_user and quest_day = v_day and cycle = v_cycle) into v_complete;

  if not p_reset and not v_complete then
    select id into v_diary from diaries where user_id = p_user
      and content ~ '[^[:space:]]'
      and created_at >= v_start and created_at < v_end
      and (v_cutoff is null or created_at >= v_cutoff)
      order by created_at, id limit 1;
    if found then
      insert into daily_quest_claims(user_id, quest_day, cycle, diary_id, reward)
        values (p_user, v_day, v_cycle, v_diary, 5)
        on conflict (user_id, quest_day, cycle) do nothing;
      if found then
        -- 보상 기록·지갑·거래 기록을 한 트랜잭션으로 반영합니다. 실패 시 함께 취소됩니다.
        perform adjust_coins(p_user, 5, 'quest', 'daily_diary:' || v_day::text || ':' || v_cycle::text);
        v_awarded := 5;
      end if;
      v_complete := true;
    end if;
  end if;

  v_coins := ensure_wallet(p_user);
  return json_build_object('quest_id', 'daily_diary', 'day', v_day, 'cycle', v_cycle,
    'completed', v_complete, 'progress', case when v_complete then 1 else 0 end,
    'target', 1, 'reward', 5, 'awarded', v_awarded, 'coins', v_coins,
    'reset_allowed', v_allowed, 'after_reset', v_cutoff is not null, 'next_reset_at', v_end);
end;
$$;

revoke all on function public.sync_daily_quest(uuid, boolean) from public, anon, authenticated;
grant execute on function public.sync_daily_quest(uuid, boolean) to service_role;
commit;
