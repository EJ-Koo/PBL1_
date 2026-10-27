# 2단계 로컬 검증: 의미 임베딩 → 관련 기억 → 3D 좌표

- 프로젝트: 오늘의별일 · 작성일: 2026-10-26 (2026-10-27 GPU로 재실행·갱신) · 상태: **로컬 실험 완료** → 이후 AI 서비스·백엔드·DB·프론트 로컬 연동까지 완료(`step2_integration_local_ko.md`), 운영 배포 전
- 설계 문서: `ai/reports/step2_positioning_design_ko.md`
- 노트북: `ai/notebooks/07_embedding_retrieval.ipynb`, `ai/notebooks/08_positioning.ipynb` (실행 결과 포함)
- 실행 근거: `ai/scripts/step2_e2e_check.py` → `ai/outputs/step2/e2e/e2e_run_log.json`

> **합성 pilot 평가입니다.** 개발자가 쓴 가상 일기 76개와 작성자가 정한 관련성 규칙으로 측정했습니다.
> 실제 사용자 일기 성능이나 사람 평가 결과가 아닙니다. 질의가 split당 38개뿐이라 0.05 안팎의 차이는 우연일 수 있습니다.

## 1. 한 일

일기 텍스트 → 의미 임베딩 → 관련 기억 검색 → 3D 좌표 생성 → 새 일기 추가 시 기존 좌표 유지까지를 로컬에서 실제 모델로 실행했다.

1. 가상 일기 10개로 KURE-v1 작은 실행: 1024차원, L2 노름 1.000, 자기 자신 제외 검색. 10개 모두 top-1이 같은 사건이었다.
2. 같은 저장소로 첫 좌표 생성과 순차 추가를 확인했다. 기존 좌표 이동은 0이었다.
3. 평가셋을 76개로 늘려 임베딩 모델 3종을 비교했다(07).
4. 같은 임베딩으로 좌표 방식 3종과 무작위 기준을 비교했다(08).
5. 핵심 흐름을 실제 모델로 처음부터 끝까지 실행했다(e2e). 규칙 점검 10개를 모두 통과했다.

**지킨 원칙**: 위치 = 의미, 감정 = 색·밝기. 관련성 판단은 원본 임베딩 코사인으로 하고, 3D 거리는 시각화용으로만 쓴다. 코사인 유사도는 확률이 아니다.
임계값 τ는 dev에서만 정했다. 투영기는 dev에만 fit했다. 모델 학습·미세조정, 별자리·군집(HDBSCAN), LLM 이름 생성은 하지 않았다.

## 2. 가상 일기 평가셋 (`ai/configs/pilot_diaries.json`, pilot-0.1)

| 항목 | 내용 |
|---|---|
| 규모 | 76개 = dev 38 + test 38. **사건(thread) 단위 분리**: 같은 사건의 변형이 두 split에 걸치지 않음(노트북에서 확인) |
| 주제 | 공부·일·가족·친구·연애·운동건강·여행·반려동물(8개) + 독립 기록(split마다 3개) |
| 사례 유형 | 같은 주제·다른 감정, 다른 주제·같은 감정, 같은 단어·다른 사건(혼동 쌍 6), 다른 표현·같은 활동(5쌍), 두 주제 혼합(split마다 3), 관련 없는 독립 기록, 짧은(17자~)·긴(~220자) 기록 |
| 관련성 | 2 = 같은 사건 또는 같은 대상이 이어지는 쌍(지정 6쌍) · 1 = 주제만 겹침 · 0 = 공유 주제 없음. 같은 split 안에서만 정의 |
| 쌍 분포 | dev: 2가 20쌍, 1이 52쌍, 0이 631쌍 · test: 2가 18쌍, 1이 54쌍, 0이 631쌍 |
| 검토용 표 | `ai/outputs/step2/review/pilot_diaries_review.csv`, `pilot_relevance_pairs_review.csv` (로컬, Git 제외) |

메타데이터(주제·사건·정서)는 평가에만 쓰고 모델 입력은 `text`만 넣었다.

## 3. 임베딩 모델 비교 (07)

모델 설정은 공식 카드에서 확인했다(`ai/configs/embedding_models.json`, revision 고정). 세 모델 모두 MIT 라이선스다.

| 모델 | pooling·정규화·prefix | 차원 | dev nDCG@5 | test Recall@3 | test nDCG@5 (95% 구간) | test 무관 연결률 | 고립 기록 오연결 | 1개 지연(GPU) |
|---|---|---|---|---|---|---|---|---|
| **KURE-v1** | CLS·L2·없음 | 1024 | **0.762** | **0.924** | 0.649 (0.570–0.722) | 0.356 | 1/3 | 약 10ms |
| bge-m3 (dense) | CLS·L2·없음 | 1024 | 0.708 | 0.742 | 0.570 (0.486–0.642) | 0.579 | 3/3 | 약 10ms |
| e5-small | mean·L2·`query: ` | 384 | 0.704 | 0.894 | **0.695** (0.625–0.755) | **0.059** | 0/3 | **약 6ms** |

- 무관 연결률: 상위 3개 중 코사인 ≥ τ인 것을 연결했을 때 관련성 0인 비율. τ는 모델마다 dev에서 정했다(KURE 0.557, bge 0.526, e5 0.897).
- 감정보다 주제를 따르는가: "같은 사건·다른 정서"가 "다른 주제·같은 정서"보다 높게 나올 확률(AUC)이 test에서 KURE 0.93, bge 0.89, e5 0.97이었다. 세 모델 모두 감정보다 사건·주제를 따랐다.
- 혼동 쌍: "배"(배탈↔유람선), "병원"(할머니↔동물병원)은 잘 구분했다. "발표", "마감"은 KURE·bge에서 τ 위로 연결됐다(같은 단어 + 비슷한 압박 상황).
- 다른 표현·같은 활동: 세 모델 모두 순위 1~3위로는 찾았지만, τ를 넘은 것은 5쌍 중 2쌍뿐이었다.

**추천**: 미리 정한 규칙(dev nDCG@5 우선)에 따라 **KURE-v1**을 1순위로 둔다. 08 좌표 비교도 KURE-v1로 했다.
다만 test에서 무관 연결이 35.6%라 지금 τ를 서비스 "관련 기억" 표시에 바로 쓰기는 이르다.
**e5-small**은 순위 품질이 KURE와 신뢰구간이 겹치고, GPU 메모리가 약 1/4(0.5GB vs 2.3GB)이며, test 무관 연결이 낮았다.
test 결과를 본 뒤 선택을 바꾸지는 않았다. 더 큰 dev셋에서 KURE와 다시 비교할 후보로 남긴다. bge-m3는 모든 지표에서 KURE 이하라 제외해도 된다.

## 4. 3D 좌표 방식 비교 (08, KURE-v1)

공통 규칙(`ai/src/positioning/store.py`): 기존 좌표는 다시 계산하지 않는다. 충돌(최소 간격 0.8 미만)이 나면 새 별만 비켜 놓는다.
첫 일기·이웃 없는 일기도 좌표를 만든다. 같은 `diary_id`는 다시 만들지 않는다. `embedding_version`·`layout_version`을 기록한다.
투영기는 dev 38개에만 fit했다. test 38개는 `diary_id` 순서로 빈 우주에 하나씩 넣었다.

| 방식 | 관련성 0/2 거리비 | 직접 관련이 3D 이웃 3개 안 | kNN 보존@5 | trust.@5 | 순서 바꿀 때 위치 달라진 일기 | 좌표 생성 시간(중앙값) |
|---|---|---|---|---|---|---|
| R 무작위(현재 운영과 같음) | 1.09 | 12% | 0.111 | 0.485 | 0% | 0.04ms |
| A 고정 PCA | 1.37 | 18% | 0.289 | 0.773 | 18% (충돌 회피만) | 0.03ms |
| B 고정 PCA+UMAP transform | **1.82** | 30% | 0.247 | 0.701 | 5% (충돌 회피만) | 1.3ms (첫 호출 약 0.6초) |
| **C 의미 이웃 순차 삽입** | 1.79 | **42%** | **0.326** | 0.741 | 71% (평균 1.6, 최대 4.6) | 0.05ms |

- 네 방식 모두 추가 중·재로딩 후 기존 좌표 이동 0, 중복 요청 재생성 없음, 최소 간격 위반 0이었다. 이동량 0은 규칙 준수일 뿐 품질이 아니다(무작위도 0).
- 다른 임베딩 모델에서도 확인했다(`layout_quality_all_models.csv`). 직접 관련 배치는 세 모델 모두 C가 1위였다(KURE 42%·bge-m3 39%·e5 64%, B는 30%·36%·46%).
- **B(UMAP)는 불안정했다.** CPU 임베딩(10-26)에서는 B가 거리비 2.17·직접 관련 48%로 가장 좋았다. 그런데 CPU와 최대 1e-7만 다른 GPU 임베딩에서는 1.82·30%로 떨어졌다. A·C는 두 실행의 결과가 같았다.
- C는 순서에 따라 위치가 달라지지만, 품질 범위는 유지됐다(kNN 0.33~0.41, 거리비 1.79~1.92). 실제로는 작성 순서가 하나이고 기존 좌표는 바뀌지 않는다.

**추천: C (관련 기억 근처에 놓고, 이웃이 없으면 고정 PCA 위치)**
- "관련 기억 근처에 새 별"이라는 목표를 그대로 구현한다. 세 모델에서 일관되게 A보다 좋다.
- numpy만 쓰고 1ms 미만이다. 첫 일기·관련 없는 일기도 억지 연결 없이 좌표를 받는다.
- 조건: C 앵커 22개 중 8개가 관련성 0이었다. τ 품질이 좌표에 그대로 반영되므로 τ 재검증이 먼저다.
- B는 입력의 작은 차이에도 배치가 크게 바뀌어 후보에서 뺀다.

## 5. 끝까지 실행한 근거 (e2e, 실제 KURE-v1)

`.venv\Scripts\python ai\scripts\step2_e2e_check.py` → `ai/outputs/step2/e2e/e2e_run_log.json` (`all_passed: true`)

| 점검 | 결과 |
|---|---|
| 07과 같은 embedding_version, 1024차원·노름 1 | 통과 |
| dev를 다시 인코딩해 τ 재계산 = 07의 τ(0.5571) | 통과 |
| 첫 일기(D039) 좌표 생성, 관련 기억 없음 | 통과 |
| 38개 순차 추가 중 기존 좌표 최대 이동 0 (GPU, 추가 1개 중앙값 약 11ms, 대부분 임베딩 계산) | 통과 |
| 같은 ID 재요청(내용 바꿔도) → 새로 만들지 않음 | 통과 |
| 새 일기 2개 추가 시 기존 좌표 이동 0 | 통과 |
| 저장 → 재로딩 → 좌표·버전 동일, 재로딩 뒤 추가해도 기존 좌표 이동 0, 재로딩 뒤 중복 요청 거부 | 통과 |

관찰(모델 판단, 통과 집계에 넣지 않음):
- 새 일기 "햄스터 쳇바퀴"는 햄스터 기록 3개와 연결됐다.
- 새 일기 "방울토마토"는 관련 기억이 없어 연결 없이 PCA 위치에 놓였다.
- 고립 기록 D076(이사 짐 정리)은 D056(이별 후 물건 정리)과 잘못 연결됐다.

## 6. 실패 사례와 한계

- **τ 일반화**: dev 38개로 정한 τ가 test에서 흔들린다(KURE 무관 연결 15% → 36%). 지금 결과의 가장 큰 약점이다.
- **짧은 기록**: "야간 알바 끝, 폐기 삼각김밥…" 같은 짧은 글은 KURE가 짝을 못 찾았다(표본 3개).
- **라벨 경계**: D052(룸메이트와 화해)↔D072(동료와 가까워짐)는 규칙상 0이지만, 사람에 따라 관련 있다고 볼 수 있다. 관련성은 작성자 1명이 정했고 사람 검토는 하지 않았다.
- **3D 거리의 한계**: PCA 3축은 임베딩 분산의 20%만 담는다. 고립 기록도 3D에서 특별히 떨어져 보이지 않는다. "관련 기억 없음"은 3D 거리가 아니라 τ 기반 연결 정보로 보여 줘야 한다.
- **작은 참조 집합**: 투영기를 38개로 fit했다. B(UMAP)는 이 영향이 커서 CPU·GPU 임베딩의 미세한 차이에도 결과가 달라졌다.
- **좌표 범위**: A·C 좌표는 반지름 0.7~7.4, B는 9.5~13.8이다. 프론트 장면(별 반지름 3~12, 카메라 z=5)에 맞추는 변환은 아직 없다.
- **재현성**: 같은 일기를 다른 묶음 크기로 인코딩하면 벡터가 최대 3e-7 다르다(패딩 차이). τ·검색에는 영향이 없다. 하지만 투영기를 다시 fit하면 fingerprint가 바뀌므로, 서비스에서는 투영기를 한 번 fit해 저장하고 다시 fit하지 않는다.

## 7. 메모리·속도 (GPU RTX 4060 Ti, float32, 모델마다 새 프로세스)

| 모델 | 파라미터 | GPU 메모리(가중치) | GPU 최대 | 로딩 | 일기 1개 GPU | 76개 묶음 GPU | 참고: 일기 1개 CPU(10-26) |
|---|---|---|---|---|---|---|---|
| KURE-v1 | 568M | 약 2.2GB | 약 2.3GB | 약 4s | 약 10ms | 약 0.4s | 약 57ms |
| bge-m3 | 568M | 약 2.2GB | 약 2.3GB | 약 3s | 약 10ms | 약 0.4s | 약 57ms |
| e5-small | 118M | 약 0.45GB | 약 0.5GB | 약 2s | 약 6ms | 약 0.1s | 약 9ms |

- 검색 지표·τ는 CPU 실행과 소수 셋째 자리까지 같았다. 장치를 바꿔도 임베딩 비교 결론은 그대로다.
- 첫 실행(10-26)에는 다른 학습 프로세스가 GPU를 쓰고 있어 CPU로 돌렸다. 10-27에는 GPU가 비어 GPU로 다시 실행했다.
- 1단계 감정 모델(KcELECTRA, 약 0.5GB)과 KURE-v1을 한 GPU에 함께 올리면 약 3GB가 필요하다. 8GB GPU에 충분히 들어간다.
- 모델 캐시는 약 4.9GB다(`ai/.cache`, Git 제외).

## 8. 실행 방법

```powershell
# 저장소 루트, 프로젝트 .venv
.venv\Scripts\python -m pip install -r ai\requirements-step2.txt
.venv\Scripts\python ai\scripts\run_notebook.py --notebook ai\notebooks\07_embedding_retrieval.ipynb --executed-out ai\outputs\step2\notebooks\07_embedding_retrieval.executed.ipynb --keep-outputs
.venv\Scripts\python ai\scripts\run_notebook.py --notebook ai\notebooks\08_positioning.ipynb --executed-out ai\outputs\step2\notebooks\08_positioning.executed.ipynb --keep-outputs
.venv\Scripts\python ai\scripts\step2_e2e_check.py
```

- 처음 실행할 때 모델 3종(약 4.9GB)을 받는다. 임베딩은 GPU로 실행한다(`embedding_models.json`의 `device`). 이 PC에서는 07 약 1분, 08 약 20초, e2e 약 15초 걸렸다.
- 확인 순서: 07의 3절(작은 실행) → 5절 표 → 10절 해석 → 08의 4.1절(규칙 점검) → 5·6절 → `ai/outputs/step2/figures/08_layout_C_neighbor.html`(브라우저) → e2e 로그.

## 9. 아직 안 한 것

- AI 서비스 `/embed`·`/layout` API, 백엔드 연동, DB 스키마(pgvector 등), 프론트 좌표 범위 변환. 이번 범위에서 일부러 제외했다.
- 더 큰 dev셋으로 τ 재설정, 사람 검토로 관련성 라벨 확정, KURE vs e5 재비교.
- 별자리(연결선)·군집, 그룹 우주 좌표.
- 큰 참조 문장 집합으로 투영기 fit, GPU에서의 속도 측정.

## 10. 생성 파일

| 구분 | 파일 |
|---|---|
| 코드 | `ai/src/embedding/{__init__,encoders,retrieval}.py`, `ai/src/positioning/{__init__,projectors,store,evaluate,universe}.py` |
| 스크립트 | `ai/scripts/step2_e2e_check.py`, `ai/scripts/measure_embedding_resources.py`, `ai/scripts/run_notebook.py`(`--keep-outputs` 옵션 추가) |
| 설정 | `ai/configs/pilot_diaries.json`, `embedding_models.json`, `step2_experiment.json` |
| 노트북 | `ai/notebooks/07_embedding_retrieval.ipynb`, `08_positioning.ipynb` (출력 포함 — Git 공유 전 `--strip-only`로 정리) |
| 의존성 | `ai/requirements-step2.txt` (scikit-learn 1.9.1, umap-learn 0.5.12, plotly 7.1.0, psutil 7.2.2) |
| 결과(Git 제외) | `ai/outputs/step2/` — embeddings, review, results, figures(3D HTML·PNG), layouts, notebooks(실행본), e2e |
