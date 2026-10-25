import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiAdminLogin } from '@/lib/api';

export type AdminLoginResult = { ok: true } | { ok: false; error: string };

type AdminContextValue = {
  isAdminLoggedIn: boolean;
  adminToken: string | null;
  adminUsername: string | null;
  adminLogin: (username: string, password: string) => Promise<AdminLoginResult>;
  adminLogout: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);

  const value = useMemo<AdminContextValue>(
    () => ({
      isAdminLoggedIn: !!adminToken,
      adminToken,
      adminUsername,
      adminLogin: async (username: string, password: string): Promise<AdminLoginResult> => {
        try {
          const result = await apiAdminLogin(username, password);
          setAdminToken(result.access_token);
          setAdminUsername(result.username);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '로그인에 실패했습니다.',
          };
        }
      },
      adminLogout: () => {
        setAdminToken(null);
        setAdminUsername(null);
      },
    }),
    [adminToken, adminUsername]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
