-- =============================================================================
-- 2026-11-26  상점 '음악' 탭: 임시 음원 2곡(우주 산책·고요한 밤) → 오늘의별일 테마곡 2곡으로 교체
-- Supabase → SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전.
--
-- 아이템을 지우지 않고(지우면 user_items 구매 기록이 함께 지워진다: on delete cascade) 같은 id 의
-- 이름·아이콘·설명·음원만 바꾼다. 예전 곡을 산 사용자는 새 곡을 그대로 가진다(코인·구매 기록·장착 상태 그대로).
-- 음원 파일은 앱에 들어 있다(frontend/assets/audio/todays-star-01.mp3, todays-star-02.mp3).
-- =============================================================================

update items set
  name = '반짝이는 하루',
  icon = '✨',
  description = '가볍게 반짝이며 흐르는 오늘의별일 테마곡',
  effect = '{"type":"music","track":"sparkle_day"}'
where id = 'music_space';

update items set
  name = '은하수를 건너',
  icon = '🌌',
  description = '천천히 차오르는 은하수 여행 같은 오늘의별일 테마곡',
  effect = '{"type":"music","track":"milky_way"}'
where id = 'music_night';

-- 확인: 두 줄이 새 이름으로 나오면 성공
select id, name, icon, effect, is_active from items where slot = 'music' order by sort_order;
