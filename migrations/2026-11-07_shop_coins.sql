-- =============================================================================
-- 2026-11-07  코인 · 상점 · 보유 아이템 · 설정값
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하다 (이미 있는 표·행은 건드리지 않는다).
--
-- 값 바꾸는 법 (코드 수정·재배포 없이 바로 반영):
--   - 시작 코인     : 관리자 화면 > 설정  (또는 app_config 표의 start_coins)
--   - 아이템·가격   : 관리자 화면 > 상점  (또는 items 표)
--   - 사용자 코인   : 관리자 화면 > 코인  (기록이 coin_logs 에 남는다)
-- =============================================================================

-- 설정값 ------------------------------------------------------------------------
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- 처음 가입한 사람이 받는 코인. 테스트 동안 999, 배포할 때 0으로 바꾼다.
insert into app_config (key, value) values ('start_coins', '999')
  on conflict (key) do nothing;

-- 지갑 (사용자당 1행) ---------------------------------------------------------------
create table if not exists wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 코인 기록 (얼마가 왜 바뀌었는지) ------------------------------------------------------
create table if not exists coin_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,          -- +는 획득, -는 사용
  balance integer not null,        -- 바뀐 뒤 잔액
  reason text not null,            -- start / purchase / admin / quest ...
  ref text,                        -- 아이템 id, 퀘스트 id, 관리자 메모 등
  created_at timestamptz not null default now()
);
create index if not exists coin_logs_user_created_idx on coin_logs (user_id, created_at desc);

-- 아이템 --------------------------------------------------------------------------
-- kind
--   consumable : 여러 개 살 수 있고 개수가 쌓임 (예: 프리즘)
--   equip      : 한 번만 살 수 있고 장착/해제. 같은 slot 끼리는 하나만 장착됨
-- effect : 앱이 읽어서 효과를 낸다. 지금 앱이 아는 type
--   {"type":"background","tint":"#0B2A6B","opacity":0.45}  우주 배경 색 덧씌우기
--   {"type":"comet","interval_sec":5}                      혜성 떨어지기
--   {"type":"streak_shield"}                               연속 기록 1회 방어 (퀘스트 단계에서 연결)
create table if not exists items (
  id text primary key,
  name text not null,
  icon text not null default '⭐',
  description text not null default '',
  price integer not null check (price >= 0),
  kind text not null check (kind in ('consumable', 'equip')),
  slot text,
  effect jsonb not null default '{}',
  is_active boolean not null default true,   -- false 면 상점에서 안 팔림 (이미 산 사람은 계속 사용)
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'consumable' or slot is not null)
);

insert into items (id, name, icon, description, price, kind, slot, effect, sort_order) values
  ('prism', '프리즘',       '❄️', '연속 출석 멈춤을 1회 방어할 수 있다.', 30, 'consumable', null,
     '{"type":"streak_shield"}', 10),
  ('blue',  '배경 (blue)',  '🌌', '나의 우주 배경을 바꿀 수 있다.',       50, 'equip', 'background',
     '{"type":"background","tint":"#0B2A6B","opacity":0.45}', 20),
  ('comet', '혜성',         '☄️', '5초마다 나의 우주에 혜성이 떨어진다.',   30, 'equip', 'effect',
     '{"type":"comet","interval_sec":5}', 30),
  ('black', '배경 (black)', '🌃', '나의 우주 배경을 바꿀 수 있다.',       50, 'equip', 'background',
     '{"type":"background","tint":"#000000","opacity":0.7}', 40)
  on conflict (id) do nothing;

-- 보유 아이템 ----------------------------------------------------------------------
create table if not exists user_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references items (id) on update cascade on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- RLS: 정책 없이 켜 둔다 → 앱(anon 키)으로는 접근 불가, 백엔드(service 키)만 사용.
alter table app_config enable row level security;
alter table wallets enable row level security;
alter table coin_logs enable row level security;
alter table items enable row level security;
alter table user_items enable row level security;

-- 함수 -----------------------------------------------------------------------------
-- 코인 계산은 DB 안에서 한 번에 처리한다 (동시에 두 번 눌러도 코인이 음수가 되거나 두 번 빠지지 않게).

-- 지갑이 없으면 시작 코인으로 만들고, 현재 코인을 돌려준다.
create or replace function ensure_wallet(p_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_start integer;
  v_coins integer;
begin
  select coins into v_coins from wallets where user_id = p_user;
  if found then
    return v_coins;
  end if;

  select greatest(coalesce((value #>> '{}')::integer, 0), 0) into v_start
    from app_config where key = 'start_coins';
  v_start := coalesce(v_start, 0);

  insert into wallets (user_id, coins) values (p_user, v_start)
    on conflict (user_id) do nothing;
  if found then
    insert into coin_logs (user_id, delta, balance, reason) values (p_user, v_start, v_start, 'start');
  end if;

  select coins into v_coins from wallets where user_id = p_user;
  return v_coins;
end;
$$;

-- 아이템 구매. 실패하면 아래 메시지로 예외: item_not_found / already_owned / not_enough_coins
create or replace function purchase_item(p_user uuid, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item items;
  v_coins integer;
  v_qty integer;
begin
  perform ensure_wallet(p_user);

  select * into v_item from items where id = p_item and is_active;
  if not found then
    raise exception 'item_not_found';
  end if;

  if v_item.kind = 'equip' and exists (
    select 1 from user_items where user_id = p_user and item_id = p_item and quantity > 0
  ) then
    raise exception 'already_owned';
  end if;

  update wallets set coins = coins - v_item.price, updated_at = now()
    where user_id = p_user and coins >= v_item.price
    returning coins into v_coins;
  if not found then
    raise exception 'not_enough_coins';
  end if;

  insert into user_items (user_id, item_id, quantity) values (p_user, p_item, 1)
    on conflict (user_id, item_id) do update set quantity = user_items.quantity + 1
    returning quantity into v_qty;

  insert into coin_logs (user_id, delta, balance, reason, ref)
    values (p_user, -v_item.price, v_coins, 'purchase', p_item);

  return json_build_object('coins', v_coins, 'item_id', p_item, 'quantity', v_qty);
end;
$$;

-- 장착/해제. 같은 slot 의 다른 아이템은 자동으로 해제. 실패: not_owned
create or replace function equip_item(p_user uuid, p_item text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_slot text;
begin
  select i.slot into v_slot
    from user_items u join items i on i.id = u.item_id
    where u.user_id = p_user and u.item_id = p_item and u.quantity > 0 and i.kind = 'equip';
  if not found then
    raise exception 'not_owned';
  end if;

  if p_on then
    update user_items u set equipped = false
      from items i
      where u.item_id = i.id and u.user_id = p_user and i.slot = v_slot and u.item_id <> p_item;
  end if;

  update user_items set equipped = p_on where user_id = p_user and item_id = p_item;
end;
$$;

-- 코인 더하기/빼기 (관리자 지급·차감, 이후 퀘스트 보상). 잔액이 음수가 되면: not_enough_coins
create or replace function adjust_coins(p_user uuid, p_delta integer, p_reason text, p_ref text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_coins integer;
begin
  perform ensure_wallet(p_user);

  update wallets set coins = coins + p_delta, updated_at = now()
    where user_id = p_user and coins + p_delta >= 0
    returning coins into v_coins;
  if not found then
    raise exception 'not_enough_coins';
  end if;

  insert into coin_logs (user_id, delta, balance, reason, ref)
    values (p_user, p_delta, v_coins, p_reason, p_ref);
  return v_coins;
end;
$$;

-- 앱(anon/authenticated 키)이 함수를 직접 부르지 못하게 막고, 백엔드(service_role)만 허용.
revoke all on function ensure_wallet(uuid) from public, anon, authenticated;
revoke all on function purchase_item(uuid, text) from public, anon, authenticated;
revoke all on function equip_item(uuid, text, boolean) from public, anon, authenticated;
revoke all on function adjust_coins(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function ensure_wallet(uuid) to service_role;
grant execute on function purchase_item(uuid, text) to service_role;
grant execute on function equip_item(uuid, text, boolean) to service_role;
grant execute on function adjust_coins(uuid, integer, text, text) to service_role;
