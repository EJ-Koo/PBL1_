-- =============================================================================
-- 2026-11-15  나만의 별자리(Level 4, LLM 개인화 생성) 저장 표
-- 먼저 실행해야 하는 파일: diary_galaxy_schema.sql, 2026-11-13_diary_topic.sql
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. 여러 번 실행해도 안전하다(if not exists / drop policy if exists).
--
-- 왜 새 표인가
--   Level 1~3 은 앱에 들어 있는 고정 템플릿이라 저장할 것이 없다(해금은 일기 수로 매번 계산).
--   Level 4 는 사용자마다 LLM 이 만든 모양이 달라 결과(좌표·연결선·이름·설명)를 보관해야 하고,
--   한 번 만든 뒤에는 다시 LLM 을 부르지 않고 이 값을 그대로 쓴다. 일기·행성과 성격이 달라 별도 표로 둔다.
--
-- 바뀌는 것
--   - personal_constellations 표 추가. 사용자·주제마다 최대 1행(unique (user_id, topic)) → 같은 주제 중복 생성 방지.
--   - status: pending(만드는 중) / ready(완성) / failed(실패, 다시 시도 가능). stage: 실제 진행 단계(화면 표시용).
--   - run_id: 생성 작업 식별자. 다시 시도·결과 저장은 'run_id 가 그대로일 때만' 바꾼다(중복 작업 방지).
--   - points / connections: 화면 표시용 정규화 좌표(30개)와 연결선. 행성의 실제 좌표(stars.x/y/z)와는 별개다.
--   - planet_ids: points[i] 에 놓일 일기(행성) id. 생성 당시 그 주제의 오래된 순 30개.
--   - usage: 호출 수·토큰 수·추정 비용(비용 추적). 일기 원문·프롬프트·LLM 응답 원문은 저장하지 않는다.
--
-- 바뀌지 않는 것
--   - diaries · stars · planet_effects · 상점 표는 건드리지 않는다. 기존 행을 지우거나 고치지 않는다.
--   - 기존 데이터에서 옮길 것이 없다(새 기능).
--
-- 접근 권한
--   - RLS 켬. 사용자는 자기 행만 읽을 수 있다(select 정책). insert/update/delete 정책은 두지 않는다
--     → 앱 사용자(anon/authenticated 키)는 쓸 수 없고, 백엔드(service 키, RLS 우회)만 user_id 조건을 걸어 쓴다.
--   - 사용자 계정이 지워지면 함께 지워진다(on delete cascade).
--
-- 되돌리기(필요할 때만, 만든 개인화 별자리가 지워지므로 주의):
--   drop table if exists personal_constellations;
-- =============================================================================

create table if not exists personal_constellations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  status text not null default 'pending',
  stage text not null default 'queued',
  run_id uuid not null,
  attempts integer not null default 0,
  name text,
  concept text,
  shape_label text,
  description text,
  reason text,
  keywords jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  points jsonb,
  connections jsonb,
  planet_ids jsonb not null default '[]'::jsonb,
  required_planets integer not null default 30,
  source_diary_count integer,
  shape_source text,
  generation_version text not null default 'v1',
  model text,
  usage jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint personal_constellations_user_topic_key unique (user_id, topic),
  constraint personal_constellations_topic_check check (
    topic in ('travel', 'relationship', 'study_achievement', 'rest_daily', 'challenge_activity', 'other')
  ),
  constraint personal_constellations_status_check check (status in ('pending', 'ready', 'failed')),
  constraint personal_constellations_attempts_check check (attempts >= 0),
  constraint personal_constellations_shape_source_check check (shape_source is null or shape_source in ('llm', 'catalog')),
  -- 완성(ready) 행은 좌표 개수 = 필요 행성 수, 연결선·이름이 반드시 있다
  constraint personal_constellations_ready_check check (
    status <> 'ready' or (
      name is not null
      and jsonb_typeof(points) = 'array' and jsonb_array_length(points) = required_planets
      and jsonb_typeof(connections) = 'array' and jsonb_array_length(connections) between 1 and 40
      and jsonb_typeof(planet_ids) = 'array' and jsonb_array_length(planet_ids) = required_planets
    )
  )
);

alter table personal_constellations enable row level security;

drop policy if exists "personal_constellations_select_own" on personal_constellations;
create policy "personal_constellations_select_own" on personal_constellations
  for select using (auth.uid() = user_id);

comment on table personal_constellations is
  '나만의 별자리(Level 4). LLM 이 같은 주제 일기 30개 이상을 분석해 만든 별자리. 사용자·주제당 1개, 한 번 만들면 바꾸지 않는다.';
comment on column personal_constellations.points is
  '화면 표시용 정규화 좌표 [[x,y,z]...] (긴 쪽 반폭 1, y 위). 행성 실제 좌표(stars)와 무관';
comment on column personal_constellations.planet_ids is
  'points[i] 에 놓일 일기 id(생성 당시 오래된 순). 일기가 지워지면 화면에서 다음으로 오래된 일기로 채운다';
