-- =============================================================================
-- 2026-11-21  행성 표면 스타일(오팔 유리·솜사탕 구름·진주 실크·크리스탈 프리즘·오로라 리본)을 상점에서 사고,
--             원하는 일기 행성에 직접 적용
-- 먼저 실행해야 하는 파일: 2026-11-07_shop_coins.sql, 2026-11-12_planet_effects.sql
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. 여러 번 실행해도 안전하다.
--
-- 상점 카테고리
--   - 행성 표면(Surface Style, 이 파일): 행성 표면 재질. 칸(slot) planet_surface, 아이템 id 는 sf_ 로 시작.
--   - 행성 효과(Special Effect, 2026-11-12): 행성 주변 효과. 칸 planet_effect, 아이템 id 는 fx_ 로 시작. 이 파일은 바꾸지 않는다.
--   → 행성 하나에 표면 하나 + 효과 하나를 따로 고를 수 있다(표가 따로라 서로 덮어쓰지 않음).
--
-- 규칙은 행성 효과와 같다
--   · 소모품(consumable): 1개 = 행성 1개. 여러 번 살 수 있고 보유 개수가 쌓인다.
--   · 남은 개수 = 산 개수(user_items.quantity) − 그 표면을 적용 중인 행성 수(planet_surfaces).
--   · 해제하거나 다른 표면으로 바꾸면 1개가 남은 개수로 돌아온다.
--   · 행성 하나에 표면은 하나만(planet_surfaces 기본키 = diary_id).
--
-- 바뀌지 않는 것: diaries · stars · planet_effects · 기존 아이템과 구매 기록. 감정 분석 결과·좌표·크기와 무관하다.
-- 이 파일을 실행해도 기존 데이터는 바뀌거나 지워지지 않는다(표·아이템·함수를 새로 추가만 한다).
-- =============================================================================

-- 판매 아이템 5개 ---------------------------------------------------------------------
insert into items (id, name, icon, description, price, kind, slot, effect, sort_order) values
  ('sf_opal_glass',    '오팔 유리구슬 표면',   '🔮', '감정 색 위로 무지갯빛 유리 광택과 빛결이 흐른다.',      120, 'consumable', 'planet_surface',
     '{"type":"planet_surface","surface":"opal_glass"}', 120),
  ('sf_pastel_cloud',  '솜사탕 구름 표면',     '🍥', '감정 색으로 물든 부드러운 구름결이 표면을 감싼다.',     120, 'consumable', 'planet_surface',
     '{"type":"planet_surface","surface":"pastel_cloud"}', 130),
  ('sf_pearl_silk',    '진주 실크 표면',       '🦪', '진주 광택과 실크 같은 빛줄기가 감정 무늬를 따라 흐른다.', 120, 'consumable', 'planet_surface',
     '{"type":"planet_surface","surface":"pearl_silk"}', 140),
  ('sf_crystal_prism', '크리스탈 프리즘 표면', '💠', '감정 색 보석 결정면과 프리즘 반짝임이 비친다.',         120, 'consumable', 'planet_surface',
     '{"type":"planet_surface","surface":"crystal_prism"}', 150),
  ('sf_aurora_ribbon', '오로라 리본 표면',     '🎐', '감정 색 오로라 리본이 유리구슬 속을 유영한다.',         120, 'consumable', 'planet_surface',
     '{"type":"planet_surface","surface":"aurora_ribbon"}', 160)
  on conflict (id) do nothing;

-- 행성에 적용한 표면 (일기 하나당 최대 1행) ----------------------------------------------------
create table if not exists planet_surfaces (
  diary_id uuid primary key references diaries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references items (id) on update cascade on delete cascade,
  applied_at timestamptz not null default now()
);
create index if not exists planet_surfaces_user_idx on planet_surfaces (user_id);

-- RLS: 정책 없이 켜 둔다 → 앱(anon 키)으로는 접근 불가, 백엔드(service 키)만 사용 (상점 표들과 같은 방식).
alter table planet_surfaces enable row level security;

-- 표면 적용·변경·해제 ----------------------------------------------------------------------
-- p_item 이 null 이면 해제(기본 표면으로). 실패하면 아래 메시지로 예외:
--   diary_not_found   : 일기가 없거나 다른 사람의 일기
--   surface_not_owned : 사지 않은 표면이거나 표면 아이템이 아님
--   surface_all_used  : 산 개수를 모두 다른 행성에 적용 중
create or replace function apply_planet_surface(p_user uuid, p_diary uuid, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_qty integer;
  v_used integer;
begin
  perform 1 from diaries where id = p_diary and user_id = p_user for update;
  if not found then
    raise exception 'diary_not_found';
  end if;

  if p_item is null then
    delete from planet_surfaces where diary_id = p_diary;
    return json_build_object('diary_id', p_diary, 'item_id', null);
  end if;

  select u.quantity into v_qty
    from user_items u join items i on i.id = u.item_id
    where u.user_id = p_user and u.item_id = p_item and u.quantity > 0
      and i.slot = 'planet_surface' and i.effect ->> 'type' = 'planet_surface'
    for update of u;
  if not found then
    raise exception 'surface_not_owned';
  end if;

  if exists (select 1 from planet_surfaces where diary_id = p_diary and item_id = p_item) then
    return json_build_object('diary_id', p_diary, 'item_id', p_item);
  end if;

  select count(*) into v_used from planet_surfaces where user_id = p_user and item_id = p_item;
  if v_used >= v_qty then
    raise exception 'surface_all_used';
  end if;

  insert into planet_surfaces (diary_id, user_id, item_id) values (p_diary, p_user, p_item)
    on conflict (diary_id) do update set item_id = excluded.item_id, applied_at = now();
  return json_build_object('diary_id', p_diary, 'item_id', p_item);
end;
$$;

revoke all on function apply_planet_surface(uuid, uuid, text) from public, anon, authenticated;
grant execute on function apply_planet_surface(uuid, uuid, text) to service_role;
