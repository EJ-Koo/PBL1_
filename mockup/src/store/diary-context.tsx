import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiLogin, apiSignup } from '@/lib/api';

export type Visibility = 'public' | 'friends' | 'private';

export type DiaryEntry = {
  id: string;
  text: string;
  photoUri: string | null;
  visibility: Visibility;
  createdAt: number;
  color: string;
};

export type LoginResult = { ok: true } | { ok: false; error: string };
export type SignupResult =
  | { ok: true; emailConfirmationRequired: boolean }
  | { ok: false; error: string };

type DiaryContextValue = {
  isLoggedIn: boolean;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => void;
  entries: DiaryEntry[];
  addEntry: (text: string, photoUri: string | null, visibility: Visibility) => void;
  updateEntry: (id: string, text: string, photoUri: string | null, visibility: Visibility) => void;
  getEntry: (id: string) => DiaryEntry | undefined;
  isEditableToday: (id: string) => boolean;
};

const PLANET_COLORS = ['#7C6CF6', '#F6A96C', '#6CF6C1', '#F66C9E', '#6CB4F6'];

function isSameDay(timestamp: number) {
  const a = new Date(timestamp);
  const b = new Date();
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DiaryContext = createContext<DiaryContextValue | null>(null);

export function DiaryProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  const value = useMemo<DiaryContextValue>(
    () => ({
      isLoggedIn,
      accessToken,
      login: async (email: string, password: string): Promise<LoginResult> => {
        try {
          const result = await apiLogin(email, password);
          setAccessToken(result.access_token);
          setIsLoggedIn(true);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '로그인에 실패했습니다.',
          };
        }
      },
      signup: async (email: string, password: string): Promise<SignupResult> => {
        try {
          const result = await apiSignup(email, password);
          if (result.access_token) {
            setAccessToken(result.access_token);
            setIsLoggedIn(true);
          }
          return { ok: true, emailConfirmationRequired: result.email_confirmation_required };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '회원가입에 실패했습니다.',
          };
        }
      },
      logout: () => {
        setAccessToken(null);
        setIsLoggedIn(false);
      },
      entries,
      addEntry: (text: string, photoUri: string | null, visibility: Visibility) => {
        const entry: DiaryEntry = {
          id: String(Date.now()),
          text,
          photoUri,
          visibility,
          createdAt: Date.now(),
          color: PLANET_COLORS[entries.length % PLANET_COLORS.length],
        };
        setEntries((prev) => [entry, ...prev]);
      },
      updateEntry: (id: string, text: string, photoUri: string | null, visibility: Visibility) => {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, text, photoUri, visibility } : e))
        );
      },
      getEntry: (id: string) => entries.find((e) => e.id === id),
      isEditableToday: (id: string) => {
        const entry = entries.find((e) => e.id === id);
        return entry ? isSameDay(entry.createdAt) : false;
      },
    }),
    [isLoggedIn, accessToken, entries]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary() {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within DiaryProvider');
  return ctx;
}
