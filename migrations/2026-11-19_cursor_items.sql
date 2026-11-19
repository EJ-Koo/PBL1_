-- Requires 2026-11-07_shop_coins.sql. Uses the existing purchase and equipment APIs.
begin;

insert into public.items (id, name, icon, description, price, kind, slot, effect, is_active, sort_order)
values ('cursor_stardust', '별가루', '✦', '마우스를 따라 흩어지는 하얀 별빛', 0, 'equip', 'cursor',
        '{"type":"cursor","style":"stardust","color":"#FFFFFF"}', false, 0)
on conflict (id) do nothing;

-- A paid or disabled starter would break the grant for every new account.
alter table public.items drop constraint if exists cursor_stardust_default;
alter table public.items add constraint cursor_stardust_default check (
  id <> 'cursor_stardust' or (kind = 'equip' and slot is not distinct from 'cursor'
    and price = 0 and not is_active
    and effect = '{"type":"cursor","style":"stardust","color":"#FFFFFF"}'::jsonb)
);

create or replace function public.grant_starter_cursor() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into user_items (user_id, item_id, quantity, equipped)
  values (new.user_id, 'cursor_stardust', 1, true)
  on conflict (user_id, item_id) do nothing;
  return new;
end;
$$;
drop trigger if exists grant_starter_cursor on public.wallets;
create trigger grant_starter_cursor after insert on public.wallets
for each row execute function public.grant_starter_cursor();

insert into public.user_items (user_id, item_id, quantity, equipped)
select w.user_id, 'cursor_stardust', 1, not exists (
  select 1 from public.user_items u join public.items i on i.id = u.item_id
  where u.user_id = w.user_id and i.slot = 'cursor' and u.equipped and u.quantity > 0
) from public.wallets w
on conflict (user_id, item_id) do nothing;

-- Concurrent purchases of the same cursor must roll back the second debit.
create or replace function public.check_cursor_quantity() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from items where id = new.item_id and slot = 'cursor' and kind = 'equip') then
    raise exception 'already_owned';
  end if;
  return new;
end;
$$;
drop trigger if exists check_cursor_quantity on public.user_items;
create trigger check_cursor_quantity before insert or update of quantity on public.user_items
for each row when (new.quantity > 1) execute function public.check_cursor_quantity();

commit;
