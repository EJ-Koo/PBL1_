import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiCreateDiary, apiListDiaries, apiLogin, apiSignup, apiUpdateDiary, type ApiDiary } from '@/lib/api';

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
export type SaveResult = { ok: true } | { ok: false; error: string };

type DiaryContextValue = {
  isLoggedIn: boolean;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => void;
  entries: DiaryEntry[];
  addEntry: (text: string, photoUri: string | null, visibility: Visibility) => Promise<SaveResult>;
  updateEntry: (
    id: string,
    text: string,
    photoUri: string | null,
    visibility: Visibility
  ) => Promise<SaveResult>;
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

function toEntry(diary: ApiDiary, colorIndex: number): DiaryEntry {
  return {
    id: diary.id,
    text: diary.content,
    photoUri: diary.photo_url,
    visibility: diary.visibility,
    createdAt: new Date(diary.created_at).getTime(),
    color: PLANET_COLORS[colorIndex % PLANET_COLORS.length],
  };
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
          try {
            const diaries = await apiListDiaries(result.access_token);
            setEntries(diaries.map(toEntry));
          } catch {
            setEntries([]);
          }
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
            setEntries([]);
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
        setEntries([]);
      },
      entries,
      addEntry: async (
        text: string,
        photoUri: string | null,
        visibility: Visibility
      ): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const created = await apiCreateDiary(accessToken, {
            content: text,
            photo_url: null,
            visibility,
          });
          const entry: DiaryEntry = {
            ...toEntry(created, entries.length),
            photoUri,
          };
          setEntries((prev) => [entry, ...prev]);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '일기 저장에 실패했습니다.',
          };
        }
      },
      updateEntry: async (
        id: string,
        text: string,
        photoUri: string | null,
        visibility: Visibility
      ): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const updated = await apiUpdateDiary(accessToken, id, { content: text, visibility });
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, text: updated.content, photoUri, visibility: updated.visibility } : e
            )
          );
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '일기 수정에 실패했습니다.',
          };
        }
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
