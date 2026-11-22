-- Requires 2026-11-07_shop_coins.sql and 2026-11-19_cursor_items.sql.
-- The existing purchase/equip APIs and single-cursor ownership rules apply.
begin;

insert into public.items (id, name, icon, description, price, kind, slot, effect, is_active, sort_order)
values (
  'cursor_astronaut_blue',
  '우주비행사(blue)',
  '👨‍🚀',
  '커서 옆에서 둥둥 떠다니는 파란 우주비행사. 마우스를 움직이면 유영하고, 멈추면 정자세로 돌아와요.',
  50,
  'equip',
  'cursor',
  '{"type":"cursor","style":"astronaut_blue","color":"#48DFFF"}',
  true,
  100
)
on conflict (id) do nothing;

commit;
