import type { DailyQuest } from './quest-api';
import { apiFetch } from './auth-session';
import { API_BASE_URL } from './api-config';
import { Platform } from 'react-native';

import type { PlanetVisual } from '@/lib/planet-visual';
import type { DiaryTopic, SpecialType } from '@/lib/special-planet';

export { API_BASE_URL } from './api-config';

// 기본값은 배포 API. 로컬 검증에서는 EXPO_PUBLIC_API_URL로 지정한다.
// 로컬 백엔드로 테스트할 때만 실행 시 EXPO_PUBLIC_API_URL로 바꾼다.
// 예) $env:EXPO_PUBLIC_API_URL="http://localhost:8000"; npx expo start --web
// (AI 브랜치에서 쓰던 이름 EXPO_PUBLIC_API_BASE_URL도 그대로 받는다.)

export type ApiVisibility = 'public' | 'friends' | 'private';

export type ApiDiary = {
  author_profile?: { nickname: string; avatar_url: string | null } | null;
  quest_result?: DailyQuest | null;
  id: string;
  user_id: string;
  content: string;
  photo_url: string | null;
  // [MODIFIED 2026-11-05] 사진 여러 장(최대 5장). photo_urls는 화면 표시용 서명 URL, photo_paths는 저장 경로.
  // 서버가 예전 버전이면 없을 수 있어서 선택 값으로 둔다.
  photo_urls?: string[];
  photo_paths?: string[];
  visibility: ApiVisibility;
  created_at: string;
  updated_at: string;
  /** [2026-11-13] 일기 주제(diaries.topic, 선택). 서버가 예전 버전이거나 고르지 않았으면 null/없음. */
  topic?: DiaryTopic | null;
};

function authHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function apiReadDiary(accessToken: string, id: string): Promise<ApiDiary> {
  const response = await apiFetch(`${API_BASE_URL}/diaries/${encodeURIComponent(id)}`, { headers: authHeaders(accessToken) });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 404 ? '이 기록은 삭제되었거나 더 이상 공유되지 않아요.' : '기록을 불러오지 못했어요. 다시 시도해주세요.');
  if (data.id !== id) throw new Error('선택한 별과 기록이 일치하지 않아요.');
  return data;
}

export async function apiLogin(email: string, password: string) {
  const res = await apiFetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '로그인에 실패했습니다.');
  }
  return data as { access_token: string; refresh_token: string; user_id: string };
}

export async function apiSignup(email: string, password: string) {
  const res = await apiFetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '회원가입에 실패했습니다.');
  }
  return data as {
    user_id: string;
    access_token: string | null;
    refresh_token: string | null;
    email_confirmation_required: boolean;
  };
}

// 구글에서 받은 ID 토큰을 백엔드에 넘겨 Supabase 세션으로 교환한다. 가입/로그인 공용.
export async function apiGoogleAuth(idToken: string) {
  const res = await apiFetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? 'Google 로그인에 실패했습니다.');
  }
  return data as { access_token: string; refresh_token: string; user_id: string };
}

export type ApiStar = {
  id: string;
  diary_id: string;
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
  brightness: number;
  /** AI 감정 분석으로 정한 행성 외형. AI 서비스가 없으면 null/없음. */
  planet?: PlanetVisual | null;
  /** [2026-11-12] 사용자가 이 행성에 적용한 특수 효과(상점에서 산 효과). 없으면 null/없음 = 일반 행성. */
  effect?: SpecialType | null;
  effect_item_id?: string | null;
  /** [2026-11-12] 일기를 쓸 때 고른 주제(선택). 별자리에만 쓴다. 고르지 않았거나 AI 서비스가 없으면 null/없음. */
  topic?: DiaryTopic | null;
};

export async function apiListStars(accessToken: string) {
  const res = await apiFetch(`${API_BASE_URL}/stars`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '별 목록을 불러오지 못했습니다.');
  }
  return data as ApiStar[];
}

// ---------------------------------------------------------------- [ADDED 2026-11-15] 나만의 별자리(Level 4)
// 서버(백엔드)가 LLM 을 부른다. 앱은 LLM·API 키를 직접 다루지 않고 저장된 결과(좌표·연결선)만 받는다.
export type ApiPersonalConstellation = {
  topic: DiaryTopic;
  status: 'pending' | 'ready' | 'failed';
  /** 서버의 실제 진행 단계: queued → analyzing → designing → validating → done | failed */
  stage: string;
  name: string | null;
  concept: string | null;
  shape_label: string | null;
  description: string | null;
  reason: string | null;
  keywords: string[];
  analysis: Record<string, unknown>;
  /** 정규화 좌표(긴 쪽 반폭 1, y 위) — 화면 표시용. 행성 실제 좌표와 무관 */
  points: number[][] | null;
  connections: number[][] | null;
  planet_ids: string[];
  required_planets: number;
  source_diary_count: number | null;
  /** llm = AI가 그린 모양, catalog = 기본 도안으로 대체 */
  shape_source: 'llm' | 'catalog' | null;
  created_at: string | null;
  completed_at: string | null;
  attempts_left: number;
  error_code: string | null;
  error_message: string | null;
};

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function errorFrom(res: Response, data: unknown, fallback: string): ApiError {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; code?: string };
    return new ApiError(d.message ?? fallback, d.code ?? 'error', res.status);
  }
  return new ApiError(typeof detail === 'string' ? detail : fallback, 'error', res.status);
}

export async function apiListPersonalConstellations(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/constellations/personal`, { headers: authHeaders(accessToken) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw errorFrom(res, data, '나만의 별자리를 불러오지 못했습니다.');
  return data as ApiPersonalConstellation[];
}

/** '나만의 별자리 생성하기'. consent = 일기 내용이 외부 AI로 전송된다는 안내에 동의. 이미 있으면 저장된 결과를 돌려준다. */
export async function apiCreatePersonalConstellation(accessToken: string, topic: DiaryTopic, consent: boolean) {
  const res = await fetch(`${API_BASE_URL}/constellations/personal`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ topic, consent }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw errorFrom(res, data, '나만의 별자리를 만들지 못했습니다.');
  return data as ApiPersonalConstellation;
}

export async function apiListDiaries(accessToken: string) {
  const res = await apiFetch(`${API_BASE_URL}/diaries`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 목록을 불러오지 못했습니다.');
  }
  return data as ApiDiary[];
}

export async function apiCreateDiary(
  accessToken: string,
  payload: {
    content: string;
    photo_paths: string[];
    visibility: ApiVisibility;
    group_ids?: string[];
    /** 일기 주제(선택). AI가 특수 행성을 고를 때 보조 정보로만 쓴다. */
    topic?: DiaryTopic;
  }
) {
  const res = await apiFetch(`${API_BASE_URL}/diaries`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 저장에 실패했습니다.');
  }
  return data as ApiDiary;
}

export type ApiGroupMember = {
  user_id: string;
  nickname: string | null;
};

export type ApiGroup = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  invite_code: string;
  diary_ids: string[];
  members: ApiGroupMember[];
};

export async function apiListGroups(accessToken: string) {
  const res = await apiFetch(`${API_BASE_URL}/groups`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '그룹 목록을 불러오지 못했습니다.');
  }
  return data as ApiGroup[];
}

export async function apiCreateGroup(accessToken: string, name: string, requestId: string) {
  const res = await apiFetch(`${API_BASE_URL}/groups`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name, request_id: requestId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '그룹 생성에 실패했습니다.');
  }
  return data as ApiGroup;
}

export async function apiJoinGroup(accessToken: string, inviteCode: string) {
  const res = await apiFetch(`${API_BASE_URL}/groups/join`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ invite_code: inviteCode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '그룹 참여에 실패했습니다.');
  }
  return data as ApiGroup;
}

export async function apiLeaveGroup(accessToken: string, groupId: string) {
  const res = await apiFetch(`${API_BASE_URL}/groups/${groupId}/members/me`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '그룹 나가기에 실패했습니다.');
  }
}

// 그룹 공유 우주: 멤버 전체가 이 그룹에 태그한 일기의 별(작성자 닉네임 포함).
export type ApiGroupStar = {
  diary_id: string;
  content: string;
  created_at: string;
  nickname: string | null;
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
  brightness: number;
  planet: PlanetVisual | null;
  effect: SpecialType | null;
};

export async function apiGroupStars(accessToken: string, groupId: string) {
  const res = await apiFetch(`${API_BASE_URL}/groups/${groupId}/stars`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '그룹 우주를 불러오지 못했습니다.');
  }
  return data as ApiGroupStar[];
}

export async function apiUploadPhoto(accessToken: string, localUri: string) {
  const filename = localUri.split('/').pop()?.split('?')[0] || `photo-${Date.now()}.jpg`;
  const ext = /\.(\w+)$/.exec(filename)?.[1]?.toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const formData = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    formData.append('file', blob, filename);
  } else {
    formData.append('file', { uri: localUri, name: filename, type: mimeType } as unknown as Blob);
  }

  const res = await apiFetch(`${API_BASE_URL}/uploads/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '사진 업로드에 실패했습니다.');
  }
  return data as { photo_path: string };
}

export type ApiAdminUser = {
  user_id: string;
  email: string | null;
  nickname: string | null;
  created_at: string;
};

export type ApiAdminDiary = ApiDiary & { nickname: string | null };

function adminAuthHeaders(adminToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
}

export async function apiAdminLogin(username: string, password: string) {
  const res = await apiFetch(`${API_BASE_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '로그인에 실패했습니다.');
  }
  return data as { access_token: string; admin_id: string; username: string };
}

export async function apiAdminListUsers(adminToken: string) {
  const res = await apiFetch(`${API_BASE_URL}/admin/users`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '유저 목록을 불러오지 못했습니다.');
  }
  return data as ApiAdminUser[];
}

export async function apiAdminDeleteUser(adminToken: string, userId: string) {
  const res = await apiFetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(adminToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '유저 삭제에 실패했습니다.');
  }
}

export async function apiAdminListDiaries(adminToken: string) {
  const res = await apiFetch(`${API_BASE_URL}/admin/diaries`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 목록을 불러오지 못했습니다.');
  }
  return data as ApiAdminDiary[];
}

export async function apiAdminDeleteDiary(adminToken: string, diaryId: string) {
  const res = await apiFetch(`${API_BASE_URL}/admin/diaries/${diaryId}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(adminToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '일기 삭제에 실패했습니다.');
  }
}

export async function apiUpdateDiary(
  accessToken: string,
  id: string,
  payload: Partial<{ content: string; photo_paths: string[]; visibility: ApiVisibility; topic: DiaryTopic | null }>
) {
  const res = await apiFetch(`${API_BASE_URL}/diaries/${id}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 수정에 실패했습니다.');
  }
  return data as ApiDiary;
}
