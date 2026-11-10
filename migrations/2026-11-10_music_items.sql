-- =============================================================================
-- 2026-11-10  (선택) 테스트용 배경음악 아이템 2개
-- 앱에 이미 들어 있는 임시 음원(assets/audio 의 space.wav, night.wav)을 상점 '음악' 탭에 올린다.
-- Supabase → SQL Editor (Logs 아님!) 에 붙여넣고 Run. 여러 번 실행해도 안전.
--
-- 진짜 음원을 넣을 때 (코드 수정·재배포 없음):
--   1) Supabase → Storage 에 공개(public) 버킷을 만들고 mp3 를 올린 뒤 공개 주소를 복사
--   2) 관리자 화면 > 상점 > + 새 아이템
--        종류: 장착 아이템 / 칸(slot): music
--        효과 JSON: {"type":"music","url":"<복사한 공개 주소>"}
--      (소리 크기를 바꾸려면 "volume":0.4 처럼 0~1 값을 함께 넣는다)
--   → 저장하면 상점 '음악' 탭에 바로 나타나고, 장착하면 재생된다.
-- =============================================================================

insert into items (id, name, icon, description, price, kind, slot, effect, sort_order) values
  ('music_space', '우주 산책', '🎵', '잔잔한 우주 화음 (임시 음원)', 30, 'equip', 'music',
     '{"type":"music","track":"space"}', 50),
  ('music_night', '고요한 밤', '🌙', '조용한 밤 화음 (임시 음원)', 30, 'equip', 'music',
     '{"type":"music","track":"night"}', 60)
  on conflict (id) do nothing;
