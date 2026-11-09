import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  apiCreateDiary,
  apiCreateGroup,
  apiGoogleAuth,
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
import { fallbackVisual, type PlanetVisual } from '@/lib/planet-visual';

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
  /** 대표색(상세 화면 등 단색이 필요한 곳). 행성 렌더링은 planet을 쓴다. */
  color: string;
  /** AI 감정 분석으로 정한 별 밝기. 1이면 기존과 같은 밝기. */
  brightness: number;
  position: [number, number, number];
  /** 행성 외형(감정). AI 분석 결과가 없으면 무채색 기본 행성. 크기는 text 분량으로 따로 계산한다. */
  planet: PlanetVisual;
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
  loginWithGoogle: (idToken: string) => Promise<LoginResult>;
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

// 행성 외형: 서버(AI 감정 분석)가 준 planet을 그대로 쓴다. 없으면 저장된 대표색만, 그것도 없으면(흰색 기본값)
// 감정 색처럼 보이지 않는 무채색 기본 행성. 예전처럼 순서대로 돌아가는 팔레트 색은 쓰지 않는다(감정과 무관한 색이라서).
function starVisual(star: ApiStar | undefined): PlanetVisual {
  return star?.planet ?? fallbackVisual(star?.color ?? null);
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
    color: starVisual(star).base_color,
    brightness: star?.brightness ?? 1,
    position: star ? [star.x, star.y, star.z] : fallbackPosition(colorIndex),
    planet: starVisual(star),
  };
}

// JWT(ID 토큰) payload에서 email 클레임만 꺼낸다. 표시용이라 실패하면 null로 둔다.
function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json).email as string) ?? null;
  } catch {
    return null;
  }
}

// 로그인/구글로그인 후 공통: 일기(핵심)·별·그룹을 불러온다. 별/그룹은 보조라 실패해도
// 일기를 비우지 않도록 각각 격리한다. (그룹 API 미배포 시 /groups 404가 나도 일기·별은 그대로)
async function loadUserData(
  token: string,
  setEntries: (entries: DiaryEntry[]) => void,
  setGroups: (groups: ApiGroup[]) => void
) {
  try {
    const diaryList = await apiListDiaries(token);
    const starList = await apiListStars(token).catch(() => []);
    const groupList = await apiListGroups(token).catch(() => []);
    const starByDiaryId = new Map(starList.map((s) => [s.diary_id, s]));
    setEntries(diaryList.map((d, i) => toEntry(d, i, starByDiaryId.get(d.id))));
    setGroups(groupList);
  } catch {
    setEntries([]);
    setGroups([]);
  }
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
          await loadUserData(result.access_token, setEntries, setGroups);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '로그인에 실패했습니다.',
          };
        }
      },
      loginWithGoogle: async (idToken: string): Promise<LoginResult> => {
        try {
          const result = await apiGoogleAuth(idToken);
          setAccessToken(result.access_token);
          // 구글 계정 이메일은 ID 토큰(JWT) payload의 email 클레임에서 꺼낸다.
          setUserEmail(emailFromIdToken(idToken));
          setIsLoggedIn(true);
          await loadUserData(result.access_token, setEntries, setGroups);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.',
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
          // 내용이 바뀌면 서버가 감정 분석을 다시 해 별 색·밝기·행성 외형이 바뀌므로 다시 받아온다.
          // 행성 크기는 text(공백 제외 글자 수)로 그릴 때 계산하므로 위에서 text를 바꾼 것으로 이미 반영된다.
          const starList = await apiListStars(accessToken).catch(() => []);
          const star = starList.find((s) => s.diary_id === id);
          if (star) {
            const planet = starVisual(star);
            setEntries((prev) =>
              prev.map((e) =>
                e.id === id ? { ...e, color: planet.base_color, brightness: star.brightness, planet } : e
              )
            );
          }
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
