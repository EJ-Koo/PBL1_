-- 사용자가 Supabase SQL Editor의 일반 쿼리에서 실행합니다.
-- 기존 diary-photos Storage 버킷을 사용합니다. 공개 버킷 전환은 필요 없습니다.
begin;
do $$
begin
  if exists (select user_id from public.profiles group by user_id having count(*) > 1) then
    raise exception '중복 프로필을 먼저 확인해주세요. 기존 데이터는 삭제하지 않았습니다.';
  end if;
end $$;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists avatar_path text;
create unique index if not exists profiles_user_id_key on public.profiles (user_id);
commit;
-- 중복 확인(읽기 전용):
-- select user_id, count(*) from public.profiles group by user_id having count(*) > 1;
