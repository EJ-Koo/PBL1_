-- =============================================================================
-- 2026-11-12  행성 특수 효과(바다·구름·수정·성운·용암)를 상점에서 사고, 원하는 일기 행성에 직접 적용
-- 먼저 실행해야 하는 파일: 2026-11-07_shop_coins.sql (items, user_items, wallets, purchase_item)
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. 여러 번 실행해도 안전하다.
--
-- 바뀌는 것
--   - 특수 효과는 더 이상 AI가 자동으로 고르지 않는다. 사용자가 산 효과를 직접 고른 행성에만 그린다.
--   - 효과 아이템은 '소모품(consumable)' 종류 + 칸(slot) planet_effect 로 등록한다.
--       · 1개 = 행성 1개. 같은 효과를 여러 행성에 쓰려면 그 수만큼 산다(여러 번 살 수 있고 보유 개수가 쌓인다).
--       · 남은 개수 = 산 개수(user_items.quantity) − 그 효과를 적용 중인 행성 수(planet_effects).
--       · 행성에서 효과를 해제하거나 다른 효과로 바꾸면 그 1개는 다시 남은 개수로 돌아온다(다른 행성에 쓸 수 있다).
--       · 상점 화면에서는 '소모품' 탭의 '행성 효과' 줄에 나온다.
--   - 행성 하나에 효과는 하나만 적용된다(planet_effects 의 기본키 = diary_id).
--   - 행성 본체(감정 색·무늬·크기·위치)는 stars 표 그대로이며 이 파일은 stars·diaries 를 바꾸지 않는다.
--
-- 기존 특수 행성 데이터: 예전 방식은 별 목록을 줄 때마다 AI가 계산만 하고 DB에 저장하지 않았다.
--   → 옮길 데이터가 없다. 이 파일을 실행해도 기존 일기·별 데이터는 바뀌거나 지워지지 않는다.
--
-- 값 바꾸는 법: 가격·이름·설명·판매 여부는 관리자 화면 > 상점 (또는 items 표)
--   새 효과 아이템을 직접 추가할 때: 종류 소모품 / 칸 planet_effect / 효과 JSON {"type":"planet_effect","special":"ocean"}
--   (special 은 ocean · cloud · crystal · nebula · lava 중 하나. 앱이 모르는 값이면 그리지 않는다)
-- =============================================================================

-- 판매 아이템 5개 ---------------------------------------------------------------------
insert into items (id, name, icon, description, price, kind, slot, effect, sort_order) values
  ('fx_ocean',   '바다 효과', '🌊', '행성 주변에 신비로운 물결이 흐른다.',               100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"ocean"}', 70),
  ('fx_cloud',   '구름 효과', '☁️', '행성 주변에 부드러운 구름이 떠다닌다.',             100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"cloud"}', 80),
  ('fx_crystal', '수정 효과', '💎', '행성 주변에 빛나는 수정과 입자가 공전한다.',         100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"crystal"}', 90),
  ('fx_nebula',  '성운 효과', '🌌', '행성 주변에 오로라와 성운이 흐른다.',               100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"nebula"}', 100),
  ('fx_lava',    '용암 효과', '🌋', '행성 주변에 역동적인 에너지 입자가 흐른다.',         100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"lava"}', 110)
  on conflict (id) do nothing;

-- 이 파일의 예전 초안(장착 종류, 1번 사면 무제한)을 이미 실행했어도 소모품 방식으로 맞춘다
update items set kind = 'consumable', updated_at = now()
  where slot = 'planet_effect' and kind <> 'consumable';
update user_items u set equipped = false
  from items i where i.id = u.item_id and i.slot = 'planet_effect' and u.equipped;

-- 행성에 적용한 효과 (일기 하나당 최대 1행) ----------------------------------------------------
-- 일기가 지워지면 함께 지워진다. 아이템이 표에서 지워지면 그 효과를 쓰던 행성은 일반 행성으로 돌아간다.
create table if not exists planet_effects (
  diary_id uuid primary key references diaries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references items (id) on update cascade on delete cascade,
  applied_at timestamptz not null default now()
);
create index if not exists planet_effects_user_idx on planet_effects (user_id);

-- RLS: 정책 없이 켜 둔다 → 앱(anon 키)으로는 접근 불가, 백엔드(service 키)만 사용 (상점 표들과 같은 방식).
alter table planet_effects enable row level security;

-- 효과 적용·변경·해제 ----------------------------------------------------------------------
-- p_item 이 null 이면 해제(일반 행성으로). 실패하면 아래 메시지로 예외:
--   diary_not_found  : 일기가 없거나 다른 사람의 일기
--   effect_not_owned : 사지 않은 효과이거나 행성 효과 아이템이 아님
--   effect_all_used  : 산 개수를 모두 다른 행성에 적용 중 (더 사거나 다른 행성에서 해제해야 함)
-- 같은 행성에 다른 효과를 적용하면 바꿔 끼운다(이전 효과 1개는 남은 개수로 돌아간다).
-- 같은 행성에 이미 적용된 효과를 다시 적용하면 아무것도 바꾸지 않는다(개수도 그대로).
create or replace function apply_planet_effect(p_user uuid, p_diary uuid, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_qty integer;
  v_used integer;
begin
  -- 같은 행성에 동시에 두 번 눌러도 순서대로 처리되게 일기 행을 잠근다
  perform 1 from diaries where id = p_diary and user_id = p_user for update;
  if not found then
    raise exception 'diary_not_found';
  end if;

  if p_item is null then
    delete from planet_effects where diary_id = p_diary;
    return json_build_object('diary_id', p_diary, 'item_id', null);
  end if;

  -- 보유 행을 잠근다 → 같은 효과를 두 행성에 동시에 적용해도 남은 개수를 넘지 않는다
  select u.quantity into v_qty
    from user_items u join items i on i.id = u.item_id
    where u.user_id = p_user and u.item_id = p_item and u.quantity > 0
      and i.slot = 'planet_effect' and i.effect ->> 'type' = 'planet_effect'
    for update of u;
  if not found then
    raise exception 'effect_not_owned';
  end if;

  -- 이미 이 행성에 같은 효과가 있으면 그대로 둔다
  if exists (select 1 from planet_effects where diary_id = p_diary and item_id = p_item) then
    return json_build_object('diary_id', p_diary, 'item_id', p_item);
  end if;

  select count(*) into v_used from planet_effects where user_id = p_user and item_id = p_item;
  if v_used >= v_qty then
    raise exception 'effect_all_used';
  end if;

  insert into planet_effects (diary_id, user_id, item_id) values (p_diary, p_user, p_item)
    on conflict (diary_id) do update set item_id = excluded.item_id, applied_at = now();
  return json_build_object('diary_id', p_diary, 'item_id', p_item);
end;
$$;

revoke all on function apply_planet_effect(uuid, uuid, text) from public, anon, authenticated;
grant execute on function apply_planet_effect(uuid, uuid, text) to service_role;
