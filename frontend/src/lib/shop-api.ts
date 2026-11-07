// [ADDED 2026-11-07] 코인 · 상점 · 관리자(아이템/설정/코인) API.
import { API_BASE_URL } from '@/lib/api';

export type ItemKind = 'consumable' | 'equip';

/** 아이템 효과. 앱이 아는 type 만 동작하고, 모르는 type 은 무시한다. */
export type ItemEffect = {
  type?: 'background' | 'comet' | 'streak_shield' | string;
  tint?: string;
  opacity?: number;
  interval_sec?: number;
  [key: string]: unknown;
};

export type ShopItem = {
  id: string;
  name: string;
  icon: string;
  description: string;
  price: number;
  kind: ItemKind;
  slot: string | null;
  effect: ItemEffect;
  on_sale: boolean;
  quantity: number;
  equipped: boolean;
};

export type AdminItem = Omit<ShopItem, 'on_sale' | 'quantity' | 'equipped'> & {
  is_active: boolean;
  sort_order: number;
};

export type AdminConfigEntry = { key: string; value: unknown; description: string };
export type AdminWallet = { user_id: string; email: string | null; nickname: string | null; coins: number | null };
export type CoinLog = { delta: number; balance: number; reason: string; ref: string | null; created_at: string };

async function request<T>(path: string, token: string, init: RequestInit = {}, fallback = '요청에 실패했습니다.') {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    // FastAPI 입력 검사 오류(422)는 detail 이 배열로 온다
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('\n')
      : typeof detail === 'string'
        ? detail
        : fallback;
    throw new Error(message || fallback);
  }
  return data as T;
}

// --- 사용자 ---------------------------------------------------------------------

export const apiGetWallet = (token: string) =>
  request<{ coins: number }>('/me/wallet', token, {}, '코인을 불러오지 못했습니다.');

export const apiListShopItems = (token: string) =>
  request<ShopItem[]>('/shop/items', token, {}, '상점을 불러오지 못했습니다.');

export const apiPurchaseItem = (token: string, itemId: string) =>
  request<{ coins: number; item_id: string; quantity: number }>(
    '/shop/purchase',
    token,
    { method: 'POST', body: JSON.stringify({ item_id: itemId }) },
    '구매에 실패했습니다.'
  );

export const apiSetEquipped = (token: string, itemId: string, equipped: boolean) =>
  request<void>(
    `/me/items/${encodeURIComponent(itemId)}/equip`,
    token,
    { method: 'POST', body: JSON.stringify({ equipped }) },
    '장착에 실패했습니다.'
  );

// --- 관리자 ---------------------------------------------------------------------

export const apiAdminListItems = (token: string) => request<AdminItem[]>('/admin/items', token);

export const apiAdminCreateItem = (token: string, item: Partial<AdminItem>) =>
  request<AdminItem>('/admin/items', token, { method: 'POST', body: JSON.stringify(item) }, '아이템 추가에 실패했습니다.');

export const apiAdminUpdateItem = (token: string, id: string, changes: Partial<AdminItem>) =>
  request<AdminItem>(
    `/admin/items/${encodeURIComponent(id)}`,
    token,
    { method: 'PATCH', body: JSON.stringify(changes) },
    '아이템 수정에 실패했습니다.'
  );

export const apiAdminListConfig = (token: string) => request<AdminConfigEntry[]>('/admin/config', token);

export const apiAdminSetConfig = (token: string, key: string, value: unknown) =>
  request<AdminConfigEntry>(
    `/admin/config/${encodeURIComponent(key)}`,
    token,
    { method: 'PUT', body: JSON.stringify({ value }) },
    '설정 저장에 실패했습니다.'
  );

export const apiAdminListWallets = (token: string) => request<AdminWallet[]>('/admin/wallets', token);

export const apiAdminAdjustCoins = (token: string, userId: string, delta: number, memo: string) =>
  request<AdminWallet>(
    `/admin/wallets/${userId}/adjust`,
    token,
    { method: 'POST', body: JSON.stringify({ delta, memo }) },
    '코인 변경에 실패했습니다.'
  );

export const apiAdminCoinLogs = (token: string, userId: string) =>
  request<CoinLog[]>(`/admin/wallets/${userId}/logs`, token);
