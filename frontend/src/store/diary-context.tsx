import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  apiCreateDiary,
  apiCreateGroup,
  apiListDiaries,
  apiListGroups,
  apiListStars,
  apiLogin,
  apiSignup,
  apiUpdateDiary,
  apiUploadPhoto,
  type ApiDiary,
  type ApiGroup,
  type ApiStar,
  type ApiVisibility,
} from '@/lib/api';

export type Visibility = 'public' | 'friends' | 'private';

export type DiaryEntry = {
  id: string;
  text: string;
  photoUri: string | null;
  visibility: Visibility;
  createdAt: number;
  color: string;
  position: [number, number, number];
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
  addEntry: (
    text: string,
    photoUri: string | null,
    visibility: Visibility,
    groupIds?: string[]
  ) => Promise<SaveResult>;
  updateEntry: (
    id: string,
    text: string,
    photoUri: string | null,
    visibility: Visibility
  ) => Promise<SaveResult>;
  getEntry: (id: string) => DiaryEntry | undefined;
  isEditableToday: (id: string) => boolean;
  groups: ApiGroup[];
  createGroup: (name: string) => Promise<SaveResult>;
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

// 서버에서 아직 별 데이터를 못 받아왔을 때만 쓰는 임시 배치 (기존 클라이언트 전용 로직과 동일)
function fallbackPosition(index: number): [number, number, number] {
  const angle = (index % 8) * (Math.PI / 4);
  const ring = Math.floor(index / 8);
  const radius = 1.5 + ring * 1.2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle * 1.3) * (radius * 0.6);
  const z = -1.5 - ring * 1.2;
  return [x, y, z];
}

function toEntry(diary: ApiDiary, colorIndex: number, star?: ApiStar): DiaryEntry {
  return {
    id: diary.id,
    text: diary.content,
    photoUri: diary.photo_url,
    visibility: diary.visibility,
    createdAt: new Date(diary.created_at).getTime(),
    color: PLANET_COLORS[colorIndex % PLANET_COLORS.length],
    position: star ? [star.x, star.y, star.z] : fallbackPosition(colorIndex),
  };
}

const DiaryContext = createContext<DiaryContextValue | null>(null);

export function DiaryProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [groups, setGroups] = useState<ApiGroup[]>([]);

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
            const [diaryList, starList, groupList] = await Promise.all([
              apiListDiaries(result.access_token),
              apiListStars(result.access_token),
              apiListGroups(result.access_token),
            ]);
            const starByDiaryId = new Map(starList.map((s) => [s.diary_id, s]));
            setEntries(diaryList.map((d, i) => toEntry(d, i, starByDiaryId.get(d.id))));
            setGroups(groupList);
          } catch {
            setEntries([]);
            setGroups([]);
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
            setGroups([]);
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
        setGroups([]);
      },
      entries,
      addEntry: async (
        text: string,
        photoUri: string | null,
        visibility: Visibility,
        groupIds: string[] = []
      ): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const photo_url = photoUri ? (await apiUploadPhoto(accessToken, photoUri)).photo_path : null;
          const created = await apiCreateDiary(accessToken, {
            content: text,
            photo_url,
            visibility,
            group_ids: groupIds,
          });
          let star: ApiStar | undefined;
          try {
            const [starList, groupList] = await Promise.all([
              apiListStars(accessToken),
              apiListGroups(accessToken),
            ]);
            star = starList.find((s) => s.diary_id === created.id);
            setGroups(groupList);
          } catch {
            star = undefined;
          }
          const entry = toEntry(created, entries.length, star);
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
          const payload: { content: string; visibility: Visibility; photo_url?: string | null } = {
            content: text,
            visibility,
          };
          if (photoUri === null) {
            payload.photo_url = null;
          } else if (!/^https?:\/\//.test(photoUri)) {
            payload.photo_url = (await apiUploadPhoto(accessToken, photoUri)).photo_path;
          }
          const updated = await apiUpdateDiary(accessToken, id, payload as Partial<{
            content: string;
            photo_url: string | null;
            visibility: ApiVisibility;
          }>);
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id
                ? { ...e, text: updated.content, photoUri: updated.photo_url, visibility: updated.visibility }
                : e
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
      groups,
      createGroup: async (name: string): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const created = await apiCreateGroup(accessToken, name);
          setGroups((prev) => [created, ...prev]);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '그룹 생성에 실패했습니다.',
          };
        }
      },
    }),
    [isLoggedIn, accessToken, entries, groups]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary() {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within DiaryProvider');
  return ctx;
}
