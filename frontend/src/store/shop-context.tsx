// [ADDED 2026-11-07] 코인 · 상점 상태. 값은 전부 서버(Supabase)에 저장되고, 여기서는 화면용으로 들고만 있다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  apiGetWallet,
  apiListShopItems,
  apiPurchaseItem,
  apiSetEquipped,
  type ItemEffect,
  type ShopItem,
} from '@/lib/shop-api';
import { useDiary } from '@/store/diary-context';

export type ShopResult = { ok: true } | { ok: false; error: string };

type ShopContextValue = {
  /** 서버에서 받기 전에는 null */
  coins: number | null;
  items: ShopItem[];
  loading: boolean;
  /** 서버 오류(예: 마이그레이션 전) 문장. 없으면 null */
  error: string | null;
  refresh: () => Promise<void>;
  purchase: (itemId: string) => Promise<ShopResult>;
  setEquipped: (itemId: string, equipped: boolean) => Promise<ShopResult>;
  /** 장착 중인 아이템의 효과 목록 (홈 화면이 읽어서 배경·혜성 등을 그린다) */
  activeEffects: ItemEffect[];
};

const EMPTY: ShopItem[] = [];

const ShopContext = createContext<ShopContextValue | null>(null);

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useDiary();
  // 받은 값에 "어느 로그인의 값인지"를 같이 저장해, 로그아웃·계정 변경 시 이전 계정 값이 보이지 않게 한다.
  const [state, setState] = useState<{ token: string | null; coins: number | null; items: ShopItem[] }>({
    token: null,
    coins: null,
    items: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ token: string | null; message: string } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [wallet, list] = await Promise.all([apiGetWallet(accessToken), apiListShopItems(accessToken)]);
      setState({ token: accessToken, coins: wallet.coins, items: list });
      setError(null);
    } catch (err) {
      setError({ token: accessToken, message: message(err, '상점을 불러오지 못했습니다.') });
    }
  }, [accessToken]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchAll();
    setLoading(false);
  }, [fetchAll]);

  // 로그인하면 불러온다 (응답이 온 뒤에만 상태를 바꾼다).
  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    Promise.all([apiGetWallet(accessToken), apiListShopItems(accessToken)])
      .then(([wallet, list]) => {
        if (alive) setState({ token: accessToken, coins: wallet.coins, items: list });
      })
      .catch((err) => {
        if (alive) setError({ token: accessToken, message: message(err, '상점을 불러오지 못했습니다.') });
      });
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const current = state.token !== null && state.token === accessToken;
  const coins = current ? state.coins : null;
  const items = current ? state.items : EMPTY;
  const setCoins = (value: number) => setState((prev) => ({ ...prev, coins: value }));
  const setItems = (fn: (prev: ShopItem[]) => ShopItem[]) => setState((prev) => ({ ...prev, items: fn(prev.items) }));

  const purchase = useCallback(
    async (itemId: string): Promise<ShopResult> => {
      if (!accessToken) return { ok: false, error: '로그인이 필요합니다.' };
      try {
        const result = await apiPurchaseItem(accessToken, itemId);
        setCoins(result.coins);
        setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: result.quantity } : i)));
        return { ok: true };
      } catch (err) {
        // 가격이 바뀌었거나 판매가 끝났을 수 있으니 최신 상태로 다시 맞춘다.
        refresh();
        return { ok: false, error: message(err, '구매에 실패했습니다.') };
      }
    },
    [accessToken, refresh]
  );

  const setEquipped = useCallback(
    async (itemId: string, equipped: boolean): Promise<ShopResult> => {
      if (!accessToken) return { ok: false, error: '로그인이 필요합니다.' };
      try {
        await apiSetEquipped(accessToken, itemId, equipped);
        setItems((prev) => {
          const slot = prev.find((i) => i.id === itemId)?.slot;
          return prev.map((i) => {
            if (i.id === itemId) return { ...i, equipped };
            // 같은 칸(예: 배경)은 하나만 장착된다 — 서버와 같은 규칙
            if (equipped && slot && i.slot === slot) return { ...i, equipped: false };
            return i;
          });
        });
        return { ok: true };
      } catch (err) {
        refresh();
        return { ok: false, error: message(err, '장착에 실패했습니다.') };
      }
    },
    [accessToken, refresh]
  );

  const value = useMemo<ShopContextValue>(
    () => ({
      coins,
      items,
      loading: loading || (accessToken !== null && !current && error === null),
      error: error && error.token === accessToken ? error.message : null,
      refresh,
      purchase,
      setEquipped,
      activeEffects: items.filter((i) => i.equipped && i.quantity > 0).map((i) => i.effect ?? {}),
    }),
    [coins, items, loading, current, accessToken, error, refresh, purchase, setEquipped]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopProvider');
  return ctx;
}
