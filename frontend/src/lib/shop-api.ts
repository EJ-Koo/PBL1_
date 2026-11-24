import { API_BASE_URL } from './api';

export type ShopItem = {
  id: string;
  name: string;
  icon: string;
  description: string;
  price: number;
  kind: 'consumable' | 'equip';
  slot: string | null;
  effect: Record<string, unknown>;
  on_sale: boolean;
  quantity: number;
  equipped: boolean;
};

async function request<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : '상점 요청에 실패했습니다. 다시 시도해 주세요.');
  }
  return data as T;
}

export const apiGetWallet = (token: string, signal?: AbortSignal) =>
  request<{ coins: number }>('/me/wallet', token, { signal });

export const apiListShopItems = (token: string, signal?: AbortSignal) =>
  request<ShopItem[]>('/shop/items', token, { signal });

export const apiPurchaseItem = (token: string, itemId: string) =>
  request<{ coins: number; item_id: string; quantity: number }>('/shop/purchase', token,
    { method: 'POST', body: JSON.stringify({ item_id: itemId }) });

export const apiSetEquipped = (token: string, itemId: string, equipped: boolean) =>
  request<void>(`/me/items/${encodeURIComponent(itemId)}/equip`, token,
    { method: 'POST', body: JSON.stringify({ equipped }) });
