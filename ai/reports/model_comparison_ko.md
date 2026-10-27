# 감정 분류 모델 비교 보고서 — KcELECTRA vs KLUE-RoBERTa

- 프로젝트: 오늘의별일 · 작성일: 2026-10-18
- 노트북: `ai/notebooks/04_model_comparison.ipynb` · 설정: `ai/configs/emotion_baseline.json`, `emotion_klue_roberta_base.json`, `emotion_klue_roberta_large.json`
- 실행 ID: `baseline_v2021_s42`, `klue_roberta_base_s42`, `klue_roberta_large_s42` (가중치는 `ai/checkpoints/emotion_baseline/`, Git 제외)
- 이 문서에는 집계 수치만 담았다. KOTE 원문과 실제 사용자 일기는 넣지 않았다.

## 1. 요약

| 순위 | 구성 | test macro-F1 (라벨별 thr) | macro-F1 @0.3 | micro-F1 | AUC |
|---|---|---:|---:|---:|---:|
| 1 | **KcELECTRA + KLUE-large 앙상블** | **0.583** | 0.576 | **0.656** | **0.882** |
| 2 | **KLUE-RoBERTa-large** | **0.575** | 0.566 | 0.646 | 0.874 |
| 3 | KcELECTRA-base (기존 베이스라인) | 0.567 | 0.557 | 0.642 | 0.871 |
| 4 | KLUE-RoBERTa-base | 0.561 | 0.552 | 0.633 | 0.865 |

- **모델 크기가 효과가 있다**: KLUE base → large +0.014. KcELECTRA 대비 +0.007(95% 구간 [+0.002, +0.013])
- **사전학습 데이터는 도메인에 맞아야 한다**: 크기가 비슷하면 댓글로 학습한 KcELECTRA가 일반 한국어로 학습한 KLUE-base보다 높다(−0.007, 95% 구간 [−0.011, −0.002]).
- **서로 다른 모델의 앙상블이 가장 효과적이다**: KcELECTRA + KLUE-large 평균은 KcELECTRA 대비 +0.016(95% 구간 [+0.012, +0.020]).

## 2. 비교 조건

| 항목 | KcELECTRA-base | KLUE-RoBERTa-base | KLUE-RoBERTa-large |
|---|---|---|---|
| Hugging Face | `beomi/KcELECTRA-base` v2021 | `klue/roberta-base` @02f94ba | `klue/roberta-large` @28d9112 |
| 파라미터 | 125M | 111M | 337M |
| 사전학습 데이터 | 온라인 댓글 | 뉴스·위키 등 일반 한국어 | 위와 같음 |
| max_length (모두 잘림 0) | 256 | 320 | 320 |
| 학습률 | 2e-5 | 2e-5 | 1e-5 |
| 실효 배치 | 32 (16×2) | 32 (16×2) | 32 (8×4) |

- 같게 둔 조건: KOTE 공식 분할, 전처리, BCE, 최대 10 epoch, 조기 종료(patience 3), validation macro-F1@0.3으로 epoch 선택, threshold는 validation에서만 결정, seed 42, bf16
- large의 학습률은 large 모델에서 흔히 쓰는 1e-5로 두었다(2e-5에서 불안정해지는 경우가 많음). 학습률 탐색은 하지 않았다.

## 3. 결과

### 3.1 학습

| 모델 | 선택 epoch / 실행 | 학습 시간 | val macro-F1 (라벨별 thr) |
|---|---|---:|---:|
| KcELECTRA-base | 6 / 9 | 50분* | 0.572 |
| KLUE-RoBERTa-base | 6 / 9 | 31분 | 0.562 |
| KLUE-RoBERTa-large | 6 / 9 | 110분 | 0.582 |

\* KcELECTRA 학습 중에는 다른 프로그램이 GPU를 함께 쓴 구간이 있어, 학습 시간은 참고용이다.

- 세 모델 모두 validation loss가 4~5 epoch에서 가장 낮고 이후 오른다. 과적합 양상은 비슷하다.
- validation과 test에서 모델 순위가 같다.

### 3.2 차이의 신뢰도 (paired bootstrap, test 2,000회 재표본)

| 비교 | macro-F1 차이 | 95% 구간 |
|---|---:|---|
| KLUE-large − KcELECTRA | +0.0074 | [+0.0024, +0.0127] |
| KLUE-base − KcELECTRA | −0.0065 | [−0.0112, −0.0018] |
| 앙상블 − KcELECTRA | +0.0159 | [+0.0120, +0.0198] |
| 앙상블 − KLUE-large | +0.0085 | [+0.0048, +0.0122] |

이 구간은 test 샘플 변동만 반영하고, 학습 무작위성(seed)은 포함하지 않는다. 각 모델은 1회씩 학습했다.

### 3.3 라벨별

- 라벨별 최고 모델: KLUE-large 23개, KcELECTRA 21개, KLUE-base 0개
- **희소 라벨에서 large의 이득이 크다**(희소 8개 평균 +0.032).

| 라벨 | test 양성 | KcELECTRA | KLUE-base | KLUE-large |
|---|---:|---:|---:|---:|
| 죄책감 | 84 | 0.236 | 0.236 | 0.225 |
| 공포/무서움 | 164 | 0.308 | 0.399 | **0.415** |
| 패배/자기혐오 | 208 | 0.299 | 0.297 | **0.330** |
| 서러움 | 263 | **0.365** | 0.331 | 0.363 |
| 귀찮음 | 290 | 0.271 | 0.317 | **0.362** |
| 부끄러움 | 306 | 0.216 | 0.233 | **0.245** |

- KcELECTRA는 ‘없음’, 불쌍함/연민 등 일부 라벨에서 앞선다. 두 모델이 잘하는 라벨이 달라 앙상블 효과가 난다.

### 3.4 행성 관점 (10개 감정 그룹)

| 모델 | 그룹 macro-F1 | 기본색 일치 top-1 | top-2 |
|---|---:|---:|---:|
| KcELECTRA-base | 0.711 | 68.2% | 86.6% |
| KLUE-RoBERTa-base | 0.703 | 67.0% | 85.4% |
| KLUE-RoBERTa-large | **0.713** | **69.6%** | **87.5%** |

- 기본색 일치율은 평가자 투표 기준이다. 실제 매핑처럼 ‘없음’을 뺀 10개 그룹으로 계산해서, 02 보고서(‘없음’ 포함, 67.6%)와 정의가 조금 다르다.
- large는 지침·무기력(0.597→0.622), 평온·안심(0.643→0.670), 부끄러움·자책(0.334→0.352)에서 개선된다. ‘없음’은 낮아진다(0.551→0.521).

### 3.5 토크나이저 차이 (`[UNK]`)

| 토크나이저 | 토큰 수 중앙값 | `[UNK]` 포함 test 샘플 |
|---|---:|---:|
| KcELECTRA | 21 | 0.2% |
| KLUE | 26 | **10.2%** |

- `[UNK]`의 원인은 인터넷 말투의 희귀 음절(예: ‘덬’, ‘넼’), 오타(‘됬’), 자모 단독 문자, 전각 문장부호다. KLUE는 정제된 문장으로 사전학습했다.
- `[UNK]`가 생기는 샘플에서 KLUE 모델의 micro-F1은 0.023~0.027 낮고, KcELECTRA는 차이가 없다. 일기에 신조어·줄임말이 많다면 KLUE의 약점이 커질 수 있다.

### 3.6 비용 (이 PC 기준, RTX 4060 Ti / 24스레드 CPU)

| 모델 | 가중치 | GPU 처리량 | CPU 지연(일기 1개) |
|---|---:|---:|---:|
| KcELECTRA-base | 498MB | 약 1,140개/초 | 약 10ms |
| KLUE-RoBERTa-base | 443MB | 약 885개/초 | 약 10ms |
| KLUE-RoBERTa-large | 1,347MB | 약 290개/초 | 약 31ms |
| 앙상블 (KcELECTRA + large) | 약 1.8GB | 두 모델 합 | 약 41ms |

일기 저장 시 한 번 추론하는 용도라면 모두 충분히 빠르다. 실제 서버의 CPU·메모리에서 다시 측정해야 한다.

### 3.7 가상 일기 정성 비교 (개발자 작성 12문장)

- 자책 일기: **large만** 부끄러움 0.86, 패배/자기혐오 0.65를 상위로 낸다. 두 base 모델은 슬픔으로 분류했다.
- 편안한 일기: large는 편안/쾌적 0.95가 1위다. KcELECTRA는 기쁨이 1위였다.
- 담담한 일기: large의 ‘없음’은 0.50으로 KcELECTRA(0.36)보다 높다.
- 기쁨과 아쉬움이 섞인 일기: 세 모델 모두 즐거움을 놓친다.

## 4. 결론과 제안

1. **서비스 1차 후보**
   - 서버 자원이 충분하면 **KLUE-RoBERTa-large 단독** 또는 **KcELECTRA + KLUE-large 앙상블**
   - 가볍게 가야 하면 KcELECTRA-base
   - 일기 문장 정성 점검에서도 large가 의도에 더 가깝게 반응했다.
2. **채택 전 확인**: 차이가 0.7~1.6%p로 작다. 상위 후보(KcELECTRA, KLUE-large)를 seed 2~3개로 반복 학습해, 차이가 학습 무작위성보다 큰지 확인한다(large 1회 약 2시간).
3. **행성 매핑 재보정**: 매핑의 고리 기준(`active_min` 0.85)은 KcELECTRA 출력으로 보정한 값이다. 채택 모델이 바뀌면 03 노트북 4절 방식으로 다시 보정한다.
4. **다음 개선**: 클래스 가중치나 soft label(평가자 선택 수) 실험은 선택한 모델 위에서 진행한다.
5. **한계**: 절대 성능은 macro-F1 0.58 수준이다. KOTE는 평가자 간 라벨 불일치가 커서, 모델 교체만으로 크게 오르기 어렵다. 실제 일기(동의받은 소량)로 도메인 검증이 필요하다.

## 5. 재현

```powershell
.venv\Scripts\python ai\scripts\train_emotion_baseline.py --config ai\configs\emotion_klue_roberta_base.json  --run-id klue_roberta_base_s42
.venv\Scripts\python ai\scripts\train_emotion_baseline.py --config ai\configs\emotion_klue_roberta_large.json --run-id klue_roberta_large_s42
.venv\Scripts\python ai\scripts\run_notebook.py --notebook ai\notebooks\04_model_comparison.ipynb --executed-out ai\outputs\emotion\04_model_comparison.executed.ipynb
```
