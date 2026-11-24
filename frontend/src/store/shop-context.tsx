import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { apiGetWallet, apiListShopItems, apiPurchaseItem, apiSetEquipped, type ShopItem } from '@/lib/shop-api';
import { useDiary } from './diary-context';

type Result = { ok: true } | { ok: false; error: string };
type ShopState = { token: string | null; items: ShopItem[]; coins: number | null; error: string | null };
type ShopContextValue = {
  items: ShopItem[];
  coins: number | null;
  loading: boolean;
  error: string | null;
  busy: string | null;
  refresh: () => Promise<void>;
  purchase: (id: string) => Promise<Result>;
  setEquipped: (id: string, equipped: boolean) => Promise<Result>;
};
const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useDiary();
  const [state, setState] = useState<ShopState>({ token: null, items: [], coins: null, error: null });
  const [pending, setPending] = useState<{ token: string; id: string } | null>(null);
  const request = useRef(0);
  const sessionToken = useRef<string | null>(null);
  const mutation = useRef<{ token: string; id: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken || sessionToken.current !== accessToken) return;
    const generation = ++request.current;
    try {
      const [wallet, items] = await Promise.all([
        apiGetWallet(accessToken, signal), apiListShopItems(accessToken, signal),
      ]);
      if (!signal?.aborted && generation === request.current && sessionToken.current === accessToken) {
        setState({ token: accessToken, coins: wallet.coins, items, error: null });
      }
    } catch (error) {
      if (!signal?.aborted && generation === request.current && sessionToken.current === accessToken) {
        setState(previous => ({
          token: accessToken,
          coins: previous.token === accessToken ? previous.coins : null,
          items: previous.token === accessToken ? previous.items : [],
          error: error instanceof Error ? error.message : '상점을 불러오지 못했습니다.',
        }));
      }
    }
  }, [accessToken]);

  useEffect(() => {
    sessionToken.current = accessToken;
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); sessionToken.current = null; };
  }, [accessToken, load]);

  const act = async (id: string, equipped?: boolean): Promise<Result> => {
    if (!accessToken || sessionToken.current !== accessToken) return { ok: false, error: '로그인이 필요합니다.' };
    if (mutation.current?.token === accessToken) return { ok: false, error: '처리 중입니다. 잠시 기다려 주세요.' };
    const operation = { token: accessToken, id };
    mutation.current = operation;
    setPending(operation);
    request.current++; // A catalog response from before this action must not overwrite it.
    try {
      if (equipped === undefined) {
        const result = await apiPurchaseItem(accessToken, id);
        if (sessionToken.current === accessToken) request.current++;
        setState(previous => previous.token !== accessToken || sessionToken.current !== accessToken ? previous : {
          ...previous, error: null, coins: result.coins,
          items: previous.items.map(item => item.id === id ? { ...item, quantity: result.quantity } : item),
        });
      } else {
        await apiSetEquipped(accessToken, id, equipped);
        if (sessionToken.current === accessToken) request.current++;
        setState(previous => {
          if (previous.token !== accessToken || sessionToken.current !== accessToken) return previous;
          const slot = previous.items.find(item => item.id === id)?.slot;
          return { ...previous, error: null, items: previous.items.map(item =>
            item.id === id ? { ...item, equipped }
              : equipped && slot && item.slot === slot ? { ...item, equipped: false } : item) };
        });
      }
      return { ok: true };
    } catch (error) {
      // Reload prices/ownership after a rejected purchase or equipment request.
      void load();
      return { ok: false, error: error instanceof Error ? error.message : '요청에 실패했습니다.' };
    } finally {
      if (mutation.current === operation) {
        mutation.current = null;
        setPending(null);
      }
    }
  };

  const current = accessToken !== null && state.token === accessToken;
  return (
    <ShopContext.Provider value={{
      items: current ? state.items : [], coins: current ? state.coins : null,
      error: current ? state.error : null, loading: accessToken !== null && !current,
      busy: pending?.token === accessToken ? pending.id : null,
      refresh: load, purchase: id => act(id), setEquipped: (id, on) => act(id, on),
    }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error('useShop must be used within ShopProvider');
  return value;
}
