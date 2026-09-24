import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Visibility = 'public' | 'friends' | 'private';

export type DiaryEntry = {
  id: string;
  text: string;
  photoUri: string | null;
  visibility: Visibility;
  createdAt: number;
  color: string;
};

type DiaryContextValue = {
  isLoggedIn: boolean;
  login: () => void;
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
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  const value = useMemo<DiaryContextValue>(
    () => ({
      isLoggedIn,
      login: () => setIsLoggedIn(true),
      logout: () => setIsLoggedIn(false),
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
    [isLoggedIn, entries]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary() {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within DiaryProvider');
  return ctx;
}
