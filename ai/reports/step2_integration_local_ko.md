# 2단계 연동: AI 서비스 ↔ 백엔드 ↔ DB ↔ 프론트 (로컬 확인 안내)

- 작성일: 2026-10-27 · 상태: **로컬 연동 구현·점검 완료, 실제 DB로 화면 확인은 사용자 실행 필요**
- 실험 근거: `ai/reports/step2_local_validation_ko.md` (임베딩 KURE-v1, 좌표 방식 C)

## 1. 무엇이 바뀌었나

```
앱(frontend) ──▶ 백엔드(backend/, 로컬 :8000) ──HTTP──▶ AI 서비스(ai/service/, 로컬 :8100, GPU)
                    │  일기 저장 시                        ├ /analyze       감정 → 별 색·밝기 (1단계)
                    │                                      ├ /layout/add    일기 → 임베딩 → 관련 기억 근처 좌표 (2단계)
                    │                                      ├ /layout/update 수정: 검색용 임베딩만 갱신(좌표 유지)
                    │                                      ├ /layout/remove 삭제
                    │                                      └ /layout/related 관련 기억(코사인 ≥ τ, 최대 3개)
                    └─ Supabase stars.x/y/z·color·brightness 저장 (스키마 변경 없음)
```

| 구분 | 내용 |
|---|---|
| DB | **스키마 변경 없음.** 별 좌표는 기존 `stars.x/y/z`에 저장한다 |
| 임베딩·좌표 저장소 | AI 서비스 PC의 `ai/data/service/positioning/`(Git 제외). 사용자별 폴더, 고정 PCA 투영기는 처음 실행 때 한 번 만들고 다시 만들지 않는다 |
| 좌표 규칙 | 새 일기는 관련 기억(코사인 ≥ 0.5571) 근처, 없으면 고정 PCA 위치. **기존 별은 절대 안 움직임.** 수정해도 위치 유지, 삭제해도 다른 별 위치 유지 |
| 장면 배율 | 저장소 좌표 × 1.6 (프론트 기존 무작위 범위 반지름 3~12와 비슷하게). `service.json`의 `scene_scale` |
| 백엔드 | `ai_client.place_diary / update_diary_layout / forget_diary / related_diaries`, 일기 작성·수정·삭제에 연결, **새 API `GET /diaries/{id}/related`** |
| 실패 시 | AI 서비스가 꺼져 있거나 오류면 지금처럼 무작위 위치·흰색으로 저장(일기 저장은 항상 성공) |
| 프론트 | 화면·디자인 변경 없음. 백엔드 주소만 환경변수 `EXPO_PUBLIC_API_BASE_URL`로 바꿀 수 있게 함(없으면 운영 주소) |

## 2. 점검 결과 (DB 없이, 실제 모델·실제 HTTP)

| 점검 | 명령 | 결과 |
|---|---|---|
| AI 서비스 API 12항목 | `.venv\Scripts\python ai\scripts\check_service_layout.py` | 12/12 통과 (첫 일기, 관련·무관 일기, 중복 요청, 수정 시 위치 유지, 삭제, 재시작 후 좌표 동일, 잘못된 user_id 거부) |
| 백엔드 ↔ AI 서비스(HTTP) 7항목 | `backend\scripts\check_ai_integration.py` (AI 서비스 실행 중) | 7/7 통과 (모든 일기에 AI 색·좌표, 추가 중 기존 별 불변, 수정·삭제 후 위치 불변, 삭제된 일기는 관련 기억에서 빠짐, AI 꺼짐 → 무작위 위치로 저장) |
| 백엔드 단위 테스트 | `cd backend; .venv\Scripts\python -m pytest -q` | 23 통과 (새 테스트 8개 포함) |
| 프론트 타입 검사 | `cd frontend; npx tsc --noEmit` | 오류 없음 |

관찰(모델 판단): 강아지 일기 두 개는 서로 관련 기억으로 연결됐고, 방울토마토 일기는 연결이 없었다.
짧게 줄인 수학 일기 두 개는 유사도 0.551로 τ(0.557)를 넘지 못해 연결되지 않았다. 07 노트북에서 본 τ 경계 문제가 실제 흐름에서도 그대로 나타난다.

## 3. 실제 DB로 화면까지 확인하기 (PowerShell 창 3개)

준비: `backend/.env` 파일을 만들고 값을 채운다. 이 파일은 Git에 올라가지 않는다(`.gitignore`). 값은 화면이나 채팅에 붙여 넣지 않는다.

```
SUPABASE_URL=<팀 Supabase URL>
SUPABASE_KEY=<운영 백엔드와 같은 키>
ADMIN_JWT_SECRET=<아무 문자열; 로컬 관리자 로그인용>
AI_SERVICE_URL=http://127.0.0.1:8100
AI_SERVICE_TOKEN=<직접 정한 긴 임의 문자열>
```

**창 1 — AI 서비스 (저장소 루트, GPU)**
```powershell
$env:AI_SERVICE_TOKEN = "<위와 같은 값>"
.venv\Scripts\python -m uvicorn --app-dir ai service.app:app --host 127.0.0.1 --port 8100
# 확인: http://127.0.0.1:8100/health  → "layout": {"device": "cuda", ...}
```

**창 2 — 백엔드 (backend/)**
```powershell
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# 확인: http://127.0.0.1:8000/docs  → GET /diaries/{diary_id}/related 가 보이면 됨
```

**창 3 — 프론트 (frontend/, 웹)**
```powershell
cd frontend
$env:EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
npx expo start --web --clear
```

확인 순서
1. **새 테스트 계정**으로 가입·로그인한다. 기존 계정의 예전 일기는 무작위 위치이고 AI 저장소에 없어서 관련 기억 계산에서 빠진다.
2. 같은 주제의 일기 2개(예: 시험 걱정 → 시험 결과)와 다른 주제의 일기 1개를 쓴다.
3. 우주 화면에서 같은 주제 별이 가까이 놓였는지 보고, 새 일기를 써도 기존 별이 움직이지 않는지 본다.
4. 관련 기억은 `http://127.0.0.1:8000/docs`의 `GET /diaries/{diary_id}/related`에서 확인한다. 로그인 토큰이 필요하다. 화면 표시는 팀 논의 후 결정한다.

## 4. 주의·한계

- **운영 DB에 실제 데이터가 생긴다.** 테스트 계정의 일기·별이 팀 Supabase에 저장된다. 확인 후 앱에서 삭제하면 AI 저장소에서도 빠진다.
- 운영 Railway 백엔드는 이 변경을 아직 모른다. 운영 앱으로 쓴 일기는 지금처럼 무작위 위치이고, 로컬 AI 저장소에도 들어가지 않는다.
- AI 저장소가 이 PC에만 있다. 서버 배포 시에는 저장 위치(서버 볼륨 또는 DB의 pgvector 테이블)를 정해야 한다(팀 협의).
- τ(0.5571)는 가상 일기 dev 38개로 정한 값이다. 무관 연결·연결 누락이 있으며 실제 데이터로 다시 정해야 한다.
- `scene_scale`을 바꾸면 이미 DB에 저장된 별과 새 별의 배율이 달라진다. 바꾸려면 사용자 우주를 새로 시작해야 한다.
- 장면 좌표 중심(원점) 근처에 놓인 별은 카메라(z=5)와 가까울 수 있다. 화면에서 이상하면 배율·중심 조정을 다시 정한다.
