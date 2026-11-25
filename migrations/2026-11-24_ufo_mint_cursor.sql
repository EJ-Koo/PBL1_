-- Requires 2026-11-07_shop_coins.sql and 2026-11-19_cursor_items.sql.
-- Uses the existing atomic purchase/equip APIs and the single cursor slot.
begin;

insert into public.items (id, name, icon, description, price, kind, slot, effect, is_active, sort_order)
values (
  'cursor_ufo_mint',
  'UFO(민트)',
  '🛸',
  '좌우로 움직이면 유영하고, 클릭하면 민트빛 빔을 쏘는 UFO 커서',
  50,
  'equip',
  'cursor',
  '{"type":"cursor","style":"ufo_mint","color":"#70FFE0"}',
  true,
  110
)
on conflict (id) do nothing;

commit;
