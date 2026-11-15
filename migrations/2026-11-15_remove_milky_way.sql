-- 사용자가 실행: 은하수 상품과 연결된 보유/장착 내역 삭제.
-- FK의 ON DELETE CASCADE를 사용합니다. 코인 잔액과 coin_logs는 변경하지 않습니다.
-- 실행 전 대상 확인:
select id, name from public.items where id = 'milky_way' or effect->>'type' = 'milky_way';
begin;
delete from public.items where id = 'milky_way' or effect->>'type' = 'milky_way';
commit;
