import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type DiaryEntry = {
  id: string;
  text: string;
  photoUri: string | null;
  createdAt: number;
  color: string;
};

type DiaryContextValue = {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
  entries: DiaryEntry[];
  addEntry: (text: string, photoUri: string | null) => void;
  getEntry: (id: string) => DiaryEntry | undefined;
};

const PLANET_COLORS = ['#7C6CF6', '#F6A96C', '#6CF6C1', '#F66C9E', '#6CB4F6'];

const DiaryContext = createContext<DiaryContextValue | null>(null);

export function DiaryProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  const value = useMemo<DiaryContextValue>(
    () => ({
      isLoggedIn,
      login: () => setIsLoggedIn(true),
      logout: () => setIsLoggedIn(false),
      entries,
      addEntry: (text: string, photoUri: string | null) => {
        const entry: DiaryEntry = {
          id: String(Date.now()),
          text,
          photoUri,
          createdAt: Date.now(),
          color: PLANET_COLORS[entries.length % PLANET_COLORS.length],
        };
        setEntries((prev) => [entry, ...prev]);
      },
      getEntry: (id: string) => entries.find((e) => e.id === id),
    }),
    [isLoggedIn, entries]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary() {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within DiaryProvider');
  return ctx;
}
