import type { ItemEffect, ShopItem } from './shop-api';

export const STARTER_CURSOR_ID = 'cursor_stardust';
export const CURSOR_CACHE_PREFIX = 'star2day:cursor:v1:';
export const CURSOR_STYLES = { stardust: '별빛', dots: '빛점', diamond: '다이아몬드', astronaut_blue: '우주비행사(blue)', astronaut_pink: '우주비행사(pink)', ufo_mint: 'UFO(민트)' } as const;
export type CursorStyle = keyof typeof CURSOR_STYLES;
export type CursorEffect = { type: 'cursor'; style: CursorStyle; color: string };
export const STARDUST: CursorEffect = { type: 'cursor', style: 'stardust', color: '#FFFFFF' };

export function starterItem(equipped: boolean): ShopItem {
  return { id: STARTER_CURSOR_ID, name: '별가루', description: '마우스를 따라 흩어지는 하얀 별빛',
    icon: '✦', price: 0, kind: 'equip', slot: 'cursor', effect: STARDUST, on_sale: false, quantity: 1, equipped };
}

export function withEquipment(items: ShopItem[], id: string, on: boolean): ShopItem[] {
  const slot = items.find(item => item.id === id)?.slot;
  return items.map(item => {
    if (item.id === id) return { ...item, equipped: on };
    if (on && slot && item.slot === slot && item.equipped) return { ...item, equipped: false };
    return item;
  });
}

export function cursorEffect(effect: ItemEffect | null): CursorEffect | null {
  if (effect?.type !== 'cursor') return null;
  const style = effect.style ?? 'stardust';
  const color = effect.color ?? '#FFFFFF';
  if (typeof style !== 'string' || !Object.hasOwn(CURSOR_STYLES, style)) return null;
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) return null;
  return { type: 'cursor', style: style as CursorStyle, color: color.toUpperCase() };
}

export function equippedCursor(items: ShopItem[]) {
  const item = items.find(i => i.kind === 'equip' && i.slot === 'cursor' && i.quantity > 0 && i.equipped);
  const effect = item && cursorEffect(item.effect);
  return effect ? { ...effect, itemId: item.id } : null;
}
