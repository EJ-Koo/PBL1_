-- Requires 2026-11-07_shop_coins.sql and 2026-11-19_cursor_items.sql.
-- Same ownership, purchase, and equipment rules as the blue astronaut cursor.
begin;

insert into public.items (id, name, icon, description, price, kind, slot, effect, is_active, sort_order)
values (
  'cursor_astronaut_pink',
  '우주비행사(pink)',
  '👨‍🚀',
  '분홍 우주비행사. 마우스를 움직이면 유영하고, 멈추면 정자세로 돌아와요.',
  50,
  'equip',
  'cursor',
  '{"type":"cursor","style":"astronaut_pink","color":"#FF85C1"}',
  true,
  105
)
on conflict (id) do nothing;

commit;
