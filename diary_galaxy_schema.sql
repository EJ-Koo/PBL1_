-- diary-galaxy 핵심 스키마: profiles, diaries, stars
-- Supabase SQL Editor에서 실행

create extension if not exists "pgcrypto";

-- profiles ----------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = user_id);

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = user_id);

create policy "profiles_delete_own" on profiles
  for delete using (auth.uid() = user_id);

-- diaries -------------------------------------------------------------------
create table if not exists diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  photo_url text,
  photo_paths text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('public', 'friends', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table diaries enable row level security;

create policy "diaries_select_own" on diaries
  for select using (auth.uid() = user_id);

create policy "diaries_insert_own" on diaries
  for insert with check (auth.uid() = user_id);

create policy "diaries_update_own" on diaries
  for update using (auth.uid() = user_id);

create policy "diaries_delete_own" on diaries
  for delete using (auth.uid() = user_id);

-- stars ----------------------------------------------------------------------
-- 일기 하나당 별 하나: 글자 길이 -> size, 감정분석 결과 -> color/brightness,
-- HDBSCAN 클러스터링 결과 -> x/y/z 좌표
create table if not exists stars (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null unique references diaries (id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  color text not null default '#ffffff',
  size double precision not null default 1,
  brightness double precision not null default 1,
  created_at timestamptz not null default now()
);

alter table stars enable row level security;

-- stars는 자체 user_id가 없어 diaries를 통해 소유권을 확인
create policy "stars_select_own" on stars
  for select using (
    exists (
      select 1 from diaries
      where diaries.id = stars.diary_id
        and diaries.user_id = auth.uid()
    )
  );

create policy "stars_insert_own" on stars
  for insert with check (
    exists (
      select 1 from diaries
      where diaries.id = stars.diary_id
        and diaries.user_id = auth.uid()
    )
  );

create policy "stars_update_own" on stars
  for update using (
    exists (
      select 1 from diaries
      where diaries.id = stars.diary_id
        and diaries.user_id = auth.uid()
    )
  );

create policy "stars_delete_own" on stars
  for delete using (
    exists (
      select 1 from diaries
      where diaries.id = stars.diary_id
        and diaries.user_id = auth.uid()
    )
  );

-- migration: 이미 생성된 diaries 테이블에 공개범위/사진/수정시각 컬럼 추가 ---------
-- (신규로 위 create table을 실행하는 경우 이미 포함되어 있어 필요 없음)
alter table diaries add column if not exists photo_url text;
alter table diaries add column if not exists visibility text not null default 'private';
alter table diaries add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'diaries_visibility_check'
  ) then
    alter table diaries add constraint diaries_visibility_check
      check (visibility in ('public', 'friends', 'private'));
  end if;
end $$;

-- groups ----------------------------------------------------------------------
-- 일기를 작성할 때 선택적으로 공유할 수 있는 "그룹 우주" 묶음. groups.user_id는 그룹을 만든 소유자.
-- 친구 초대/멤버십은 아래 migration (2026-11-12) 참고: invite_code(방 ID) + group_members 로 여러 유저가 함께 쓴다.
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table groups enable row level security;

create policy "groups_select_own" on groups
  for select using (auth.uid() = user_id);

create policy "groups_insert_own" on groups
  for insert with check (auth.uid() = user_id);

-- diary_groups: 일기 하나를 그룹 0개 이상에 태그 (다대다)
create table if not exists diary_groups (
  diary_id uuid not null references diaries (id) on delete cascade,
  group_id uuid not null references groups (id) on delete cascade,
  primary key (diary_id, group_id)
);

alter table diary_groups enable row level security;

create policy "diary_groups_select_own" on diary_groups
  for select using (
    exists (
      select 1 from diaries
      where diaries.id = diary_groups.diary_id
        and diaries.user_id = auth.uid()
    )
  );

create policy "diary_groups_insert_own" on diary_groups
  for insert with check (
    exists (
      select 1 from diaries
      where diaries.id = diary_groups.diary_id
        and diaries.user_id = auth.uid()
    )
    and exists (
      select 1 from groups
      where groups.id = diary_groups.group_id
        and groups.user_id = auth.uid()
    )
  );

-- admins ----------------------------------------------------------------------
-- 일반 유저(auth.users)와 완전히 분리된 관리자 계정. 회원가입 없이 서버 스크립트로만 생성.
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
-- 의도적으로 정책을 추가하지 않음: PostgREST(anon/authenticated 롤)로는 아무도 접근 불가,
-- 백엔드가 쓰는 서비스 롤 키만 RLS를 우회해 이 테이블을 다룰 수 있음.

-- migration (2026-11-05): 일기 사진 여러 장(최대 5장) ------------------------------
-- Supabase 대시보드 → SQL Editor 에서 아래 한 줄을 실행한다. 여러 번 실행해도 안전하다.
-- 실행 전에도 서버는 동작하지만(첫 장만 저장), 실행해야 2~5번째 사진이 저장된다.
alter table diaries add column if not exists photo_paths text[] not null default '{}';

-- migration (2026-11-07): 코인 · 상점 · 보유 아이템 · 설정값 ---------------------------
-- 내용이 길어서 별도 파일로 둔다: migrations/2026-11-07_shop_coins.sql 전체를 SQL Editor에서 실행.

-- migration (2026-11-12): 그룹 친구 초대 (방 ID 코드 + 멤버십) ----------------------
-- Supabase 대시보드 → SQL Editor 에서 아래 블록을 실행한다. 여러 번 실행해도 안전하다.
-- 그룹마다 공유용 invite_code("방 ID")를 두고, group_members 로 친구를 멤버로 받는다.
-- 권한은 서비스-롤 백엔드가 담당하므로 RLS는 직접 접근 방어용(최소)만 둔다.

-- 1) 그룹에 공유 코드(방 ID) 추가
-- 기존 그룹에도 코드를 채운다. 8자 코드라 충돌 가능성이 있어 중복이면 다시 뽑는다(UNIQUE 인덱스 생성 실패 방지).
alter table groups add column if not exists invite_code text;
do $$
declare g record; c text;
begin
  for g in select id from groups where invite_code is null loop
    loop
      c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      exit when not exists (select 1 from groups where invite_code = c);
    end loop;
    update groups set invite_code = c where id = g.id;
  end loop;
end $$;
alter table groups alter column invite_code set not null;
create unique index if not exists groups_invite_code_key on groups (invite_code);

-- 2) 그룹 멤버십 (소유자 포함, 한 그룹에 여러 유저)
create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table group_members enable row level security;
drop policy if exists "group_members_select_self" on group_members;
create policy "group_members_select_self" on group_members
  for select using (auth.uid() = user_id);

-- 3) 기존 그룹 소유자를 멤버로 백필
insert into group_members (group_id, user_id)
  select id, user_id from groups
  on conflict (group_id, user_id) do nothing;
