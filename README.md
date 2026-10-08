# PBL1_

일기를 쓰면 별이 생성되고, 별들이 모여 개인 은하를 이루는 앱.

## 구조
- `backend/` — FastAPI + Supabase
- `diary_galaxy_schema.sql` — 핵심 테이블(profiles, diaries, stars) 및 RLS 정책. Supabase SQL Editor에서 실행
- `ai/` — 감정 분석·의미 임베딩·공간 배치 AI 파트. 환경 설정과 KOTE 데이터 분석 방법은 [ai/README.md](ai/README.md) 참고 (데이터·모델 가중치는 Git에 포함하지 않음)