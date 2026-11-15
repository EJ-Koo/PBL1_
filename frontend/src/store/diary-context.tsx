import { publishQuest } from '@/lib/quest-events';
import { authSession, signOut } from '@/lib/auth-session';
import { apiGetProfile, apiSaveProfile, apiUploadAvatar, type ApiProfile, type ProfileDraft } from '@/lib/profile-api';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import {
  apiCreateDiary,
  apiCreateGroup,
  apiGoogleAuth,
  apiGroupStars,
  apiJoinGroup,
  apiLeaveGroup,
  apiListDiaries,
  apiListGroups,
  apiListStars,
  apiLogin,
  apiSignup,
  apiUpdateDiary,
  apiUploadPhoto,
  type ApiDiary,
  type ApiGroup,
  type ApiGroupStar,
  type ApiStar,
} from '@/lib/api';
import { fallbackVisual, type PlanetVisual } from '@/lib/planet-visual';
import { asSpecialType, type DiaryTopic, type SpecialType } from '@/lib/special-planet';

export type Visibility = 'public' | 'friends' | 'private';

// [MODIFIED 2026-11-05] 사진 여러 장(최대 5장). uri는 화면 표시용, path는 서버 저장 경로.
// 새로 고른 사진은 path가 없고(아직 업로드 전), 저장할 때 업로드해서 path를 받는다.
export type DiaryPhoto = { id: string; uri: string; path?: string };

export type DiaryEntry = {
  id: string;
  authorId: string;
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
  /** [2026-11-12] 사용자가 상점에서 산 효과를 직접 적용한 특수 효과. 없으면 null(일반 행성). 본체(색·무늬·크기·위치)와 무관. */
  effect: SpecialType | null;
};

export type LoginResult = { ok: true } | { ok: false; error: string };
export type SignupResult =
  | { ok: true; emailConfirmationRequired: boolean }
  | { ok: false; error: string };
export type SaveResult = { ok: true } | { ok: false; error: string };

type DiaryContextValue = {
  isLoggedIn: boolean;
  isRestoring: boolean;
  dataLoading: boolean;
  loadError: string | null;
  retryLoad: () => void;
  profile: ApiProfile | null;
  saveProfile: (draft: ProfileDraft) => Promise<SaveResult>;
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
    groupIds?: string[],
    topic?: DiaryTopic | null
  ) => Promise<SaveResult>;
  updateEntry: (
    id: string,
    text: string,
    photos: DiaryPhoto[],
    visibility: Visibility
  ) => Promise<SaveResult>;
  getEntry: (id: string) => DiaryEntry | undefined;
  /** 이 일기가 '본인' 것인지(그룹 공유 우주의 남의 별과 구분 — 수정/꾸미기 숨김용). */
  isOwnEntry: (id: string) => boolean;
  /** [2026-11-12] 서버에 효과 적용·해제가 저장된 뒤 화면의 행성 효과를 바로 바꾼다(상점 store가 부른다). */
  setEntryEffect: (id: string, effect: SpecialType | null) => void;
  isEditableToday: (id: string) => boolean;
  groups: ApiGroup[];
  createGroup: (name: string) => Promise<SaveResult>;
  joinGroup: (inviteCode: string) => Promise<SaveResult>;
  leaveGroup: (groupId: string) => Promise<SaveResult>;
  /** 그룹 공유 우주: 멤버 전체가 이 그룹에 태그한 별을 불러온다(본인 것만이 아님). */
  loadGroupStars: (groupId: string) => Promise<DiaryEntry[]>;
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
    authorId: diary.user_id,
    text: diary.content,
    photoUri: photos[0]?.uri ?? null,
    photos,
    visibility: diary.visibility,
    createdAt: new Date(diary.created_at).getTime(),
    color: starVisual(star).base_color,
    brightness: star?.brightness ?? 1,
    position: star ? [star.x, star.y, star.z] : fallbackPosition(colorIndex),
    planet: starVisual(star),
    effect: asSpecialType(star?.effect),
  };
}

// 그룹 공유 우주의 별 하나(다른 멤버 포함)를 화면용 DiaryEntry로 바꾼다.
function groupStarToEntry(g: ApiGroupStar): DiaryEntry {
  const planet = g.planet ?? fallbackVisual(g.color);
  return {
    id: g.diary_id,
    authorId: '',
    text: g.content,
    photoUri: null,
    photos: [],
    visibility: 'friends',
    createdAt: new Date(g.created_at).getTime(),
    color: planet.base_color,
    brightness: g.brightness,
    position: [g.x, g.y, g.z],
    planet,
    effect: asSpecialType(g.effect),
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
async function loadUserData(token: string) {
  const [diaries, stars, groups, profile] = await Promise.all([
    apiListDiaries(token), apiListStars(token).catch(() => []),
    apiListGroups(token).catch(() => []), apiGetProfile(token).catch(() => null),
  ]);
  const byId = new Map(stars.map(star => [star.diary_id, star]));
  return { entries: diaries.map((diary, i) => toEntry(diary, i, byId.get(diary.id))), groups, profile };
}

const EMPTY_ENTRIES: DiaryEntry[] = [];
const EMPTY_GROUPS: ApiGroup[] = [];

const DiaryContext = createContext<DiaryContextValue | null>(null);

export function DiaryProvider({ children }: { children: ReactNode }) {
  const { session, ready } = useSyncExternalStore(authSession.subscribe, authSession.getSnapshot, authSession.getServerSnapshot);
  const isLoggedIn = !!session;
  const accessToken = session?.access_token ?? null;
  const userEmail = session?.email ?? null;
  const epoch = authSession.getRevision();
  const mutations = useRef({ entries: 0, groups: 0, profile: 0 });
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ epoch: number; token: string | null; entries: DiaryEntry[]; groups: ApiGroup[]; profile: ApiProfile | null; error: string | null }>({
    epoch: -1, token: null, entries: [], groups: [], profile: null, error: null,
  });
  // 그룹 공유 우주에서 받아온 멤버 전체의 별(본인 것 포함). getEntry가 상세 화면에서 남의 별도 찾게 한다.
  const [groupStarCache, setGroupStarCache] = useState<DiaryEntry[]>([]);
  const own = data.epoch === epoch;
  const entries = own ? data.entries : EMPTY_ENTRIES;
  const groups = own ? data.groups : EMPTY_GROUPS;
  const profile = own ? data.profile : null;
  const patch = useCallback((fn: (prev: typeof data) => typeof data) => {
    if (authSession.getRevision() !== epoch) return;
    setData(prev => fn(prev.epoch === epoch ? prev : { epoch, token: null, entries: [], groups: [], profile: null, error: null }));
  }, [epoch]);
  const setEntries = useCallback((value: DiaryEntry[] | ((prev: DiaryEntry[]) => DiaryEntry[])) => {
    if (authSession.getRevision() !== epoch) return;
    mutations.current.entries++;
    patch(prev => ({ ...prev, entries: typeof value === 'function' ? value(prev.entries) : value }));
  }, [patch, epoch]);
  const setGroups = useCallback((value: ApiGroup[] | ((prev: ApiGroup[]) => ApiGroup[])) => {
    if (authSession.getRevision() !== epoch) return;
    mutations.current.groups++;
    patch(prev => ({ ...prev, groups: typeof value === 'function' ? value(prev.groups) : value }));
  }, [patch, epoch]);
  useEffect(() => { void authSession.restore(); }, []);
  useEffect(() => {
    if (!accessToken || !ready) return;
    let alive = true;
    const before = { ...mutations.current };
    loadUserData(accessToken).then(result => {
      if (alive && authSession.getRevision() === epoch) setData(prev => ({
        ...result, epoch, token: accessToken, error: null,
        // A slow reload must not undo a diary/profile save that completed after it began.
        entries: prev.epoch === epoch && before.entries !== mutations.current.entries ? prev.entries : result.entries,
        groups: prev.epoch === epoch && before.groups !== mutations.current.groups ? prev.groups : result.groups,
        profile: prev.epoch === epoch && before.profile !== mutations.current.profile ? prev.profile : result.profile,
      }));
    }).catch(() => {
      if (alive && authSession.getRevision() === epoch) patch(prev => ({ ...prev, token: accessToken, error: '기록을 불러오지 못했어요. 서버 연결을 확인하고 다시 시도해주세요.' }));
    });
    return () => { alive = false; };
  }, [accessToken, ready, epoch, reload, patch]);
  const retryLoad = useCallback(() => setReload(value => value + 1), []);

  const value = useMemo<DiaryContextValue>(
    () => ({
      isLoggedIn,
      isRestoring: !ready,
      dataLoading: !!accessToken && (!own || data.token !== accessToken),
      loadError: own ? data.error : null,
      retryLoad,
      profile,
      saveProfile: async (draft) => {
        if (!accessToken || !session) return { ok: false, error: '로그인이 필요합니다.' };
        try {
          const avatar_path = draft.avatarUri ? await apiUploadAvatar(accessToken, draft.avatarUri) : draft.avatar_path;
          const saved = await apiSaveProfile(accessToken, { nickname: draft.nickname, bio: draft.bio, avatar_path });
          if (authSession.getRevision() !== epoch) return { ok: false, error: '로그인 계정이 변경됐어요. 다시 확인해주세요.' };
          mutations.current.profile++;
          mutations.current.groups++;
          patch(prev => ({ ...prev, profile: saved, groups: prev.groups.map(group => ({ ...group, members: group.members.map(member => member.user_id === session.user_id ? { ...member, nickname: saved.nickname } : member) })) }));
          return { ok: true };
        } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '프로필 저장에 실패했어요.' }; }
      },
      accessToken,
      userEmail,
      login: async (email: string, password: string): Promise<LoginResult> => {
        try {
          const result = await apiLogin(email, password);
          await authSession.establish({ ...result, email });
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
          await authSession.establish({ ...result, email: emailFromIdToken(idToken) });
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
          if (result.access_token && result.refresh_token) {
            await authSession.establish({ ...result, access_token: result.access_token, refresh_token: result.refresh_token, email });
          }
          return { ok: true, emailConfirmationRequired: result.email_confirmation_required };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '회원가입에 실패했습니다.',
          };
        }
      },
      logout: signOut,
      entries,
      addEntry: async (
        text: string,
        photos: DiaryPhoto[],
        visibility: Visibility,
        groupIds: string[] = [],
        topic: DiaryTopic | null = null
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
            // 주제는 선택 사항. 고르지 않으면 보내지 않는다(예전 요청과 같음)
            ...(topic ? { topic } : {}),
          });
          // 별/그룹 재조회는 보조. 하나가 실패(예: /groups 미배포)해도 일기 추가는 진행한다.
          const starList = await apiListStars(accessToken).catch(() => []);
          const star = starList.find((s) => s.diary_id === created.id);
          const groupList = await apiListGroups(accessToken).catch(() => null);
          if (groupList) setGroups(groupList);
          if (created.quest_result && authSession.getRevision() === epoch) {
            publishQuest({ userId: created.user_id, revision: epoch, quest: created.quest_result });
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
                e.id === id
                  ? { ...e, color: planet.base_color, brightness: star.brightness, planet, effect: asSpecialType(star.effect) }
                  : e
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
      // 본인 일기 우선, 없으면 그룹 공유 우주에서 받아온 남의 별에서 찾는다(상세 보기용).
      getEntry: (id: string) => entries.find((e) => e.id === id) ?? groupStarCache.find((e) => e.id === id),
      isOwnEntry: (id: string) => entries.some((e) => e.id === id),
      setEntryEffect: (id: string, effect: SpecialType | null) =>
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, effect } : e))),
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
      joinGroup: async (inviteCode: string): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          const joined = await apiJoinGroup(accessToken, inviteCode);
          // 이미 멤버인 그룹을 다시 참여하면 최신 정보로 교체(중복 방지).
          setGroups((prev) => [joined, ...prev.filter((g) => g.id !== joined.id)]);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '그룹 참여에 실패했습니다.',
          };
        }
      },
      leaveGroup: async (groupId: string): Promise<SaveResult> => {
        if (!accessToken) {
          return { ok: false, error: '로그인이 필요합니다.' };
        }
        try {
          await apiLeaveGroup(accessToken, groupId);
          setGroups((prev) => prev.filter((g) => g.id !== groupId));
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : '그룹 나가기에 실패했습니다.',
          };
        }
      },
      loadGroupStars: async (groupId: string): Promise<DiaryEntry[]> => {
        if (!accessToken) return [];
        try {
          const rows = await apiGroupStars(accessToken, groupId);
          const mapped = rows.map(groupStarToEntry);
          setGroupStarCache(mapped); // 상세 화면(getEntry)이 남의 별도 찾도록 캐시
          return mapped;
        } catch {
          return [];
        }
      },
    }),
    [isLoggedIn, accessToken, userEmail, entries, groups, groupStarCache, profile, session, ready, own, data.token, data.error, retryLoad, patch, setEntries, setGroups, epoch]
  );

  return <DiaryContext.Provider value={value}>{children}</DiaryContext.Provider>;
}

export function useDiary() {
  const ctx = useContext(DiaryContext);
  if (!ctx) throw new Error('useDiary must be used within DiaryProvider');
  return ctx;
}
