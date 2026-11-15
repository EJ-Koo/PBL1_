-- =============================================================================
-- 2026-11-13  일기 주제(topic)를 Supabase diaries 표에 저장 (별자리 해금·표시용)
-- 먼저 실행해야 하는 파일: diary_galaxy_schema.sql (diaries 표)
-- Supabase → SQL Editor 에 이 파일 전체를 붙여넣고 Run. 여러 번 실행해도 안전하다(if not exists).
--
-- 왜
--   지금까지 주제는 AI 서비스의 사용자별 JSON(ai/data/service/topics/…)에만 있었다.
--   AI 서비스가 꺼져 있으면 주제를 읽을 수 없고, 서버를 옮기면 사라질 수 있다.
--   주제는 일기의 메타데이터라 일기와 같은 행에 둔다(일기 1개 = 주제 0~1개 → 별도 표 없이 열 하나).
--
-- 바뀌는 것
--   - diaries.topic 열 추가(text, null 허용). 주제는 계속 선택 사항이다. null = 주제 없음.
--   - 값은 앱의 주제 목록(backend/app/schemas/diary.py 의 Topic)만 허용한다(check 제약).
--   - 사용자별 주제 개수를 셀 때 쓰는 부분 인덱스(user_id, topic) — 주제가 있는 행만.
--
-- 바뀌지 않는 것
--   - 기존 일기 행은 지우거나 고치지 않는다. 새 열은 모두 null 로 시작한다.
--   - 접근 권한: diaries 의 기존 RLS 정책(본인 행만 select/insert/update/delete)이 이 열에도 그대로 적용된다.
--     (백엔드는 service 키로 접근하고, 모든 조회·수정에 user_id 조건을 건다.)
--   - stars(좌표·색·크기)·planet_effects·상점 표는 건드리지 않는다.
--
-- 기존 주제 옮기기(AI 서비스 JSON → 이 열)
--   backend/scripts/backfill_diary_topics.py 가 JSON 을 읽어 UPDATE 문 파일을 만든다(DB에 직접 쓰지 않음).
--   만든 SQL 은 "id·user_id 가 모두 맞고 topic 이 아직 비어 있는 행"만 바꾼다 → 다른 사람 일기·이미 정한 주제는 덮어쓰지 않는다.
--   순서: ① 이 파일 실행 → ② 백엔드 배포(새 코드는 열이 없어도 동작한다) → ③ backfill SQL 검토 후 실행.
--
-- 되돌리기(필요할 때만, 주제 데이터가 지워지므로 주의):
--   drop index if exists diaries_user_topic_idx;
--   alter table diaries drop constraint if exists diaries_topic_check;
--   alter table diaries drop column if exists topic;
-- =============================================================================

alter table diaries add column if not exists topic text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'diaries_topic_check') then
    alter table diaries add constraint diaries_topic_check check (
      topic is null or topic in (
        'travel', 'relationship', 'study_achievement', 'rest_daily', 'challenge_activity', 'other'
      )
    );
  end if;
end $$;

create index if not exists diaries_user_topic_idx on diaries (user_id, topic) where topic is not null;

comment on column diaries.topic is
  '일기를 쓸 때 고른 주제(선택, null=없음). 별자리 해금·표시에만 쓴다. 값 목록: backend/app/schemas/diary.py Topic';
