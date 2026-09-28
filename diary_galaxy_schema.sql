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
