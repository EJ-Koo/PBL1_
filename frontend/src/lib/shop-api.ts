// [ADDED 2026-11-07] 코인 · 상점 · 관리자(아이템/설정/코인) API.
import { API_BASE_URL } from '@/lib/api';

export type ItemKind = 'consumable' | 'equip';

/** 아이템 효과. 앱이 아는 type 만 동작하고, 모르는 type 은 무시한다. */
export type ItemEffect = {
  type?: 'background' | 'comet' | 'streak_shield' | 'planet_effect' | string;
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

export type AdminConfigEntry = { key: string; value: unknown; description: string; kind: 'int' | 'bool' };
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

export type Wallet = { coins: number; reset_allowed: boolean };

export const apiGetWallet = (token: string) => request<Wallet>('/me/wallet', token, {}, '코인을 불러오지 못했습니다.');

// [ADDED 2026-11-09] 테스트용: 내 코인을 시작 코인으로, 산 아이템·기록 삭제
export const apiResetMyShop = (token: string) =>
  request<Wallet>('/me/shop/reset', token, { method: 'POST' }, '초기화에 실패했습니다.');

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

// [ADDED 2026-11-12] 산 행성 효과를 내 일기 행성에 적용·변경. itemId 가 null 이면 해제(일반 행성).
// 일기 주인·효과 보유는 서버가 확인한다(남의 행성, 사지 않은 효과는 거절).
export type PlanetEffectResult = { diary_id: string; item_id: string | null; effect: string | null };

export const apiSetPlanetEffect = (token: string, diaryId: string, itemId: string | null) =>
  request<PlanetEffectResult>(
    `/diaries/${encodeURIComponent(diaryId)}/effect`,
    token,
    { method: 'PUT', body: JSON.stringify({ item_id: itemId }) },
    '행성 효과를 적용하지 못했습니다.'
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

export const apiAdminResetWallet = (token: string, userId: string) =>
  request<AdminWallet>(`/admin/wallets/${userId}/reset`, token, { method: 'POST' }, '초기화에 실패했습니다.');

export const apiAdminCoinLogs = (token: string, userId: string) =>
  request<CoinLog[]>(`/admin/wallets/${userId}/logs`, token);
