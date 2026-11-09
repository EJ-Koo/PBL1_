import { Platform } from 'react-native';

import type { PlanetVisual } from '@/lib/planet-visual';

// [MODIFIED 2026-11-05] 기본값은 Cloudtype에 올린 서버 (api.star2day.com → Cloudflare → Cloudtype).
// 로컬 백엔드로 테스트할 때만 실행 시 EXPO_PUBLIC_API_URL로 바꾼다.
// 예) $env:EXPO_PUBLIC_API_URL="http://localhost:8000"; npx expo start --web
// (AI 브랜치에서 쓰던 이름 EXPO_PUBLIC_API_BASE_URL도 그대로 받는다.)
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://api.star2day.com';

export type ApiVisibility = 'public' | 'friends' | 'private';

export type ApiDiary = {
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
};

function authHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
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
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
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
  const res = await fetch(`${API_BASE_URL}/auth/google`, {
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
};

export async function apiListStars(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/stars`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '별 목록을 불러오지 못했습니다.');
  }
  return data as ApiStar[];
}

export async function apiListDiaries(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/diaries`, {
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
  }
) {
  const res = await fetch(`${API_BASE_URL}/diaries`, {
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

export type ApiGroup = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  diary_ids: string[];
};

export async function apiListGroups(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/groups`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '그룹 목록을 불러오지 못했습니다.');
  }
  return data as ApiGroup[];
}

export async function apiCreateGroup(accessToken: string, name: string) {
  const res = await fetch(`${API_BASE_URL}/groups`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '그룹 생성에 실패했습니다.');
  }
  return data as ApiGroup;
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

  const res = await fetch(`${API_BASE_URL}/uploads/photo`, {
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
  const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
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
  const res = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '유저 목록을 불러오지 못했습니다.');
  }
  return data as ApiAdminUser[];
}

export async function apiAdminDeleteUser(adminToken: string, userId: string) {
  const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(adminToken),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '유저 삭제에 실패했습니다.');
  }
}

export async function apiAdminListDiaries(adminToken: string) {
  const res = await fetch(`${API_BASE_URL}/admin/diaries`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 목록을 불러오지 못했습니다.');
  }
  return data as ApiAdminDiary[];
}

export async function apiAdminDeleteDiary(adminToken: string, diaryId: string) {
  const res = await fetch(`${API_BASE_URL}/admin/diaries/${diaryId}`, {
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
  payload: Partial<{ content: string; photo_paths: string[]; visibility: ApiVisibility }>
) {
  const res = await fetch(`${API_BASE_URL}/diaries/${id}`, {
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
