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
} from '@/lib/api';

export type Visibility = 'public' | 'friends' | 'private';

// [MODIFIED 2026-11-05] 사진 여러 장(최대 5장). uri는 화면 표시용, path는 서버 저장 경로.
// 새로 고른 사진은 path가 없고(아직 업로드 전), 저장할 때 업로드해서 path를 받는다.
export type DiaryPhoto = { id: string; uri: string; path?: string };

export type DiaryEntry = {
  id: string;
  text: string;
  photoUri: string | null;
  photos: DiaryPhoto[];
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
  // 로그인한 이메일 (일기 작성 화면의 작성자 표시용)
  userEmail: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => void;
  entries: DiaryEntry[];
  addEntry: (
    text: string,
    photos: DiaryPhoto[],
    visibility: Visibility,
    groupIds?: string[]
  ) => Promise<SaveResult>;
  updateEntry: (
    id: string,
    text: string,
    photos: DiaryPhoto[],
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

function toPhotos(diary: ApiDiary): DiaryPhoto[] {
  const urls = diary.photo_urls ?? (diary.photo_url ? [diary.photo_url] : []);
  const paths = diary.photo_paths ?? [];
  return urls.map((uri, i) => ({ id: `${diary.id}-photo-${i}`, uri, path: paths[i] }));
}

// 새로 고른 사진만 업로드하고, 이미 서버에 있는 사진은 저장 경로를 그대로 쓴다 (순서 유지).
async function uploadPhotos(accessToken: string, photos: DiaryPhoto[]): Promise<string[]> {
  const paths: string[] = [];
  for (const photo of photos) {
    paths.push(photo.path ?? (await apiUploadPhoto(accessToken, photo.uri)).photo_path);
  }
  return paths;
}

function toEntry(diary: ApiDiary, colorIndex: number, star?: ApiStar): DiaryEntry {
  const photos = toPhotos(diary);
  return {
    id: diary.id,
    text: diary.content,
    photoUri: photos[0]?.uri ?? null,
    photos,
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [groups, setGroups] = useState<ApiGroup[]>([]);

  const value = useMemo<DiaryContextValue>(
    () => ({
      isLoggedIn,
      accessToken,
      userEmail,
      login: async (email: string, password: string): Promise<LoginResult> => {
        try {
          const result = await apiLogin(email, password);
          setAccessToken(result.access_token);
          setUserEmail(email);
          setIsLoggedIn(true);
          try {
            // 일기가 핵심. 별/그룹 조회는 보조라 실패해도 일기를 비우지 않도록 각각 격리한다.
            // (그룹 API 미배포 시 /groups 404가 나도 일기·별은 그대로 보여야 함)
            const diaryList = await apiListDiaries(result.access_token);
            const starList = await apiListStars(result.access_token).catch(() => []);
            const groupList = await apiListGroups(result.access_token).catch(() => []);
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
            setUserEmail(email);
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
        setUserEmail(null);
        setIsLoggedIn(false);
        setEntries([]);
        setGroups([]);
      },
      entries,
      addEntry: async (
        text: string,
        photos: DiaryPhoto[],
        visibility: Visibility,
        groupIds: string[] = []
      ): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const photo_paths = await uploadPhotos(accessToken, photos);
          const created = await apiCreateDiary(accessToken, {
            content: text,
            photo_paths,
            visibility,
            group_ids: groupIds,
          });
          // 별/그룹 재조회는 보조. 하나가 실패(예: /groups 미배포)해도 일기 추가는 진행한다.
          const starList = await apiListStars(accessToken).catch(() => []);
          const star = starList.find((s) => s.diary_id === created.id);
          const groupList = await apiListGroups(accessToken).catch(() => null);
          if (groupList) setGroups(groupList);
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
        photos: DiaryPhoto[],
        visibility: Visibility
      ): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const photo_paths = await uploadPhotos(accessToken, photos);
          const updated = await apiUpdateDiary(accessToken, id, {
            content: text,
            visibility,
            photo_paths,
          });
          const updatedPhotos = toPhotos(updated);
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    text: updated.content,
                    photoUri: updatedPhotos[0]?.uri ?? null,
                    photos: updatedPhotos,
                    visibility: updated.visibility,
                  }
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
    [isLoggedIn, accessToken, userEmail, entries, groups]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary() {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within DiaryProvider');
  return ctx;
}
