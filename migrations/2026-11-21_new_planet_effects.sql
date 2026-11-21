-- =============================================================================
-- 2026-11-21  신규 행성 특수 효과 3종: 천상의 고리 · 공전하는 위성 · 별똥별
-- 먼저 실행해야 하는 파일: 2026-11-07_shop_coins.sql, 2026-11-12_planet_effects.sql
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. 여러 번 실행해도 안전하다.
--
-- 기존 행성 효과 5종과 완전히 같은 방식이다(새 표·새 함수 없음).
--   · 아이템: 소모품(consumable) + 칸(slot) planet_effect + 효과 JSON {"type":"planet_effect","special":"<종류>"}
--   · 구매(purchase_item)·남은 개수·행성에 적용/변경/해제(apply_planet_effect, planet_effects 표)를 그대로 쓴다.
--   · 행성 하나에 효과는 하나(기존 효과 ↔ 신규 효과 바꿔 끼우기 가능, 해제하면 1개 돌아옴).
-- 가격: 기존 행성 효과 5종이 모두 100 코인 → 같은 카테고리라 100 코인으로 맞춘다(관리자 화면에서 바꿀 수 있음).
-- 정렬: 기존 효과(70~110) 바로 뒤, 행성 표면(120~) 앞.
--
-- 이 파일은 아이템 3줄을 추가만 한다. 기존 아이템·구매 기록·코인·적용 상태는 바꾸거나 지우지 않는다.
-- =============================================================================

insert into items (id, name, icon, description, price, kind, slot, effect, sort_order) values
  ('fx_celestial_ring', '천상의 고리',   '💫', '행성을 감싸는 영롱한 빛의 궤도',               100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"celestial_ring"}', 112),
  ('fx_orbiting_moons', '공전하는 위성', '🌙', '행성 주변을 도는 작은 빛의 위성',               100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"orbiting_moons"}', 114),
  ('fx_shooting_stars', '별똥별',       '🌠', '행성 주변을 스쳐 지나가는 반짝이는 별똥별',     100, 'consumable', 'planet_effect',
     '{"type":"planet_effect","special":"shooting_stars"}', 116)
  on conflict (id) do nothing;
