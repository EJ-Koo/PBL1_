import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURSOR_CACHE_PREFIX, STARTER_CURSOR_ID, withEquipment } from './cursor-items';
import { apiSetEquipped, type ShopItem } from './shop-api';

const pendingKey = (owner: string) => `shop:starter-cursor:${owner}`;

// Only the free starter can be changed before the account catalog is available.
export async function readStarterChoice(owner: string) {
  const [choice, cached] = await Promise.all([
    AsyncStorage.getItem(pendingKey(owner)), AsyncStorage.getItem(CURSOR_CACHE_PREFIX + owner),
  ]);
  let enabled = true;
  try { if (cached !== null) enabled = JSON.parse(cached)?.itemId === STARTER_CURSOR_ID; } catch { /* old cache */ }
  const pending = choice === 'on' || choice === 'off';
  return { owner, enabled: pending ? choice === 'on' : enabled, pending };
}

export function saveStarterChoice(owner: string, on: boolean | null) {
  return on === null ? AsyncStorage.removeItem(pendingKey(owner))
    : AsyncStorage.setItem(pendingKey(owner), on ? 'on' : 'off');
}

export async function syncStarterChoice(token: string, items: ShopItem[], choice: Awaited<ReturnType<typeof readStarterChoice>>, current: () => boolean) {
  const starter = items.find(item => item.id === STARTER_CURSOR_ID && item.quantity > 0);
  if (!starter || !choice.pending || !current()) return items;
  const active = items.find(item => item.slot === 'cursor' && item.equipped && item.quantity > 0);
  const target = choice.enabled ? starter : active;
  if (target && target.equipped !== choice.enabled) {
    await apiSetEquipped(token, target.id, choice.enabled);
    items = withEquipment(items, target.id, choice.enabled);
  }
  if (current()) await saveStarterChoice(choice.owner, null);
  return items;
}
