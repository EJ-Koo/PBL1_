# 오늘의별일 — AI 파트 (`ai/`)

사진과 텍스트로 쓴 일기 하나를 3D 행성 하나로 표현하는 서비스에서, AI 파트는 다음을 맡는다.

| 기능 | 역할 | 상태 |
|---|---|---|
| 일기 감정 분석 | 감정 → 별 색·밝기 | KOTE 분석, 모델 5종 비교·개선 실험 완료. 서비스 기본은 KcELECTRA 단일. 후처리(44 → 10 그룹+없음 → 3 정서)와 행성 매핑은 **초안 v0.1** (행성 매핑 코드·설정만 이 브랜치에 있음, 나머지는 `feature/ai-service-draft` 브랜치(Draft PR)에서 작업 중, main 미반영) |
| 의미 임베딩 | 관련 기억 검색 | 로컬 구현 완료 — `feature/ai-service-draft` 브랜치(Draft PR)에서 작업 중, main 미반영 |
| 공간 알고리즘 | 별 3D 위치 | 로컬 구현 완료 — `feature/ai-service-draft` 브랜치(Draft PR)에서 작업 중, main 미반영 |
| 군집·별자리 | 비슷한 기억 묶기, 선 잇기 | 미구현 (설계만) |

## 현재 진행 상황 (2026-10-27 기준)

팀원이 헷갈리지 않도록 **확정된 것**과 **앞으로 바뀔 것**을 나눠 적는다.
이 브랜치(main 대상)에는 **확정** 항목만 들어 있다. 초안·로컬 완료 항목의 코드는 `feature/ai-service-draft` 브랜치(Draft PR)에 있다.

| 구분 | 내용 | 상태 | 앞으로 |
|---|---|---|---|
| 확정 | KOTE 데이터 분석 (노트북 01) | 완료 | 없음 |
| 확정 | 감정 분류 모델 학습·비교·개선 실험 (노트북 02·04·05) | 완료 (실험 기록) | 서비스에 앙상블을 쓸지는 배포 자원을 보고 결정 |
| 초안 | 감정 후처리, 감정 → 색·밝기·행성 매핑 (노트북 03·06) | v0.1 동작함 | **수정 예정**: 그룹 묶기, 색·밝기 규칙, 부정 편향 보정 |
| 로컬 완료 | 의미 임베딩·관련 기억·3D 위치 (노트북 07·08) | 가상 일기 76개로 검증 | 실제 데이터로 τ(관련 기억 기준값) 다시 정하기 |
| 로컬 완료 | AI 서비스(`ai/service/`) ↔ 백엔드 ↔ 프론트 연동 | 이 PC에서 동작 확인 (실제 AI 서비스 + 가짜 DB, 백엔드 테스트 23개). 실제 DB로 앱 화면 확인은 진행 전 | **배포 위치 미정**(GPU 서버·Railway 등), 모델 가중치 공유 방법 미정 |
| 미정 | 프론트 디자인 (관련 기억 표시, 별 모양) | 지금은 좌표·색·밝기만 반영, 화면 디자인 변경 없음 | 팀 논의 후 결정 |
| 미구현 | 군집(HDBSCAN)·별자리 선·LLM 이름 붙이기 | 설계만 | 다음 단계 |

- 운영 서버(Railway)와 운영 앱은 아직 AI 서비스를 모른다. 백엔드는 `AI_SERVICE_URL`이 비어 있으면 **예전과 똑같이** 동작한다(무작위 위치, 흰색 별).
- 실제 사용자 일기는 학습·평가에 쓰지 않았다. 평가는 KOTE와 개발자가 쓴 가상 일기로만 했다.

보고서
- [reports/kote_analysis_ko.md](reports/kote_analysis_ko.md): KOTE 데이터 분석
- [reports/emotion_baseline_ko.md](reports/emotion_baseline_ko.md): 감정 분류 베이스라인 성능
- [reports/model_comparison_ko.md](reports/model_comparison_ko.md): 감정 분류 모델 비교(KcELECTRA, KLUE-RoBERTa base/large, 앙상블)
- [reports/improvement_experiments_ko.md](reports/improvement_experiments_ko.md): 성능 개선 실험(그룹 동시 학습, soft label, seed 앙상블)

## 폴더 구성

```
ai/
├── notebooks/                         # 실행 결과(출력)를 포함해 올림 → GitHub에서 결과 확인 가능
│   ├── 01_data_analysis.ipynb         #   KOTE 데이터 분석
│   ├── 02_emotion_baseline.ipynb      #   감정 분류 베이스라인 성능 확인
│   ├── 04_model_comparison.ipynb      #   감정 분류 모델 비교·앙상블
│   └── 05_improvement_experiments.ipynb  # 그룹 동시 학습·soft label·seed 앙상블 실험
├── src/
│   ├── env_check.py                   # 노트북 커널에 필요한 패키지가 있는지 점검
│   ├── data/                          # 다운로드·로딩·라벨 변환·품질 점검 함수
│   │   ├── paths.py                   #   경로, HF 캐시(ai/.cache) 설정
│   │   ├── kote_download.py           #   공식 출처 다운로드 + SHA-256 manifest
│   │   ├── kote_load.py               #   TSV/Parquet/raw.json 로딩
│   │   ├── labels.py                  #   라벨 대응, 44차원 multi-hot, 원시 주석 집계
│   │   ├── quality.py                 #   품질 플래그, 최소 정규화, 텍스트 패턴
│   │   └── tokenizer_utils.py         #   토크나이저 파일만 받아 토큰 길이 측정
│   ├── emotion/                       # 감정 분류
│   │   ├── text.py                    #   모델 입력용 최소 전처리
│   │   ├── data.py                    #   토큰화, 동적 패딩 배치
│   │   ├── targets.py                 #   학습 목표: soft label(투표 비율), 행성 그룹 목표
│   │   ├── train.py                   #   학습·추론 루프 (PyTorch), 다중 과제 손실
│   │   ├── metrics.py                 #   다중 라벨 지표, threshold 조정 (numpy)
│   │   ├── predict.py                 #   학습된 모델로 추론 (EmotionPredictor)
│   │   └── planet_mapping.py          #   감정 확률 → 행성 외형 파라미터 (초안 v0.1, 실험 코드가 감정 그룹 정의로 사용)
│   ├── clustering/                    # 향후 기능 위치 (현재 비어 있음)
├── scripts/
│   ├── run_notebook.py                # 노트북 전체 실행 → 실행본 저장 (--keep-outputs: 원본에 출력 남김 + 비밀값 점검)
│   ├── train_emotion_baseline.py      # 감정 분류 학습 (초기 3개 실행에 사용)
│   └── train_emotion.py               # 감정 분류 학습 확장판: 그룹 동시 학습, soft label, --seed
├── configs/                           # Git 관리: 출처 revision, 라벨 대응, 분석·학습·매핑 설정
│   ├── kote_source.json, kote_labels.json, analysis.json
│   ├── emotion_baseline.json          #   학습 설정 (KcELECTRA-base)
│   ├── emotion_klue_roberta_base.json, emotion_klue_roberta_large.json   # 비교 모델 학습 설정
│   ├── exp_kc_{bin,mt,soft,mtsoft}.json, exp_kl_mtsoft.json   # 개선 실험 설정
│   ├── planet_mapping.json            #   감정 그룹·색·행성 규칙 (설계 초안)
│   └── demo_diaries.json              #   시연용 가상 일기 (개발자 작성)
├── reports/                           # Git 관리: 원문 없는 요약 보고서
├── requirements.txt                   # 분석 단계 (CPU)
├── requirements-train.txt             # 학습·추론 단계 (+ PyTorch CUDA)
│
├── data/raw/kote/          # (Git 제외) 원본 다운로드
├── data/processed/kote/    # (Git 제외) 가공 결과 (parquet, multi-hot npy)
├── outputs/kote/           # (Git 제외) 상세 CSV, 그림, 출력 포함 실행 노트북
├── outputs/emotion/<run>/  # (Git 제외) 학습 로그, 지표, 예측 확률, 그림
├── checkpoints/emotion_baseline/<run>/   # (Git 제외) 모델 가중치·토크나이저·thresholds.json
└── .cache/                 # (Git 제외) Hugging Face 캐시
```

Git에서 제외되는 폴더는 노트북을 실행하면 자동으로 만들어진다.

## 환경 설정

Python 3.13에서 검증했다(Windows 11, RTX 4060 Ti 8GB). 가상환경은 저장소 루트의 `.venv/`(Git 제외)를 쓴다.

```powershell
# 저장소 루트(PBL1_)에서
python -m venv .venv
.venv\Scripts\Activate.ps1          # Git Bash: source .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r ai/requirements.txt          # 데이터 분석(01)만 할 때: CPU, PyTorch 불필요
pip install -r ai/requirements-train.txt    # 학습·추론(02·04·05): PyTorch 2.14.1 + CUDA 13.0
```

- `requirements-train.txt`는 NVIDIA 드라이버가 CUDA 13.x를 지원하는 환경 기준이다(`nvidia-smi`의 `CUDA Version` 확인).
  GPU가 없거나 CUDA 버전이 다르면 파일 안내대로 torch만 맞는 빌드로 설치한다. CPU로도 추론(02·03 노트북)은 되지만 학습은 매우 느리다.
- macOS/Linux에서는 `python3 -m venv .venv && source .venv/bin/activate`를 쓴다.

### VS Code에서 Jupyter 커널 선택

1. 확장 프로그램 **Python**, **Jupyter**를 설치한다.
2. `ai/notebooks/01_data_analysis.ipynb`를 연다.
3. 오른쪽 위 **Select Kernel** → **Python Environments** → `.venv (Python 3.13.x)`를 고른다.
   보이지 않으면 `Ctrl+Shift+P` → `Python: Select Interpreter` → `.\.venv\Scripts\python.exe`를 고른 뒤 다시 시도한다.
4. **Run All**을 누른다. 노트북은 저장소 루트·`ai/`·`ai/notebooks/` 어디에서 실행해도 경로를 같게 잡는다.

**`ModuleNotFoundError: No module named 'pyarrow'` 같은 오류가 나면** 다른 커널(예: conda 환경)이 선택된 것이다.
노트북은 노트북마다 커널 선택을 따로 기억하므로, 오른쪽 위 커널 이름이 `.venv`인지 확인하고 아니면 다시 고른다.
각 노트북의 첫 코드 셀이 현재 커널의 패키지를 점검하고, 빠진 패키지가 있으면 그 자리에서 멈추고 안내한다.

## KOTE 데이터

- 출처: GitHub [searle-j/KOTE](https://github.com/searle-j/KOTE), Hugging Face [searle-j/kote](https://huggingface.co/datasets/searle-j/kote)
- 논문: Jeon, Lee, Kim (2022). *User Guide for KOTE: Korean Online Comments Emotions Dataset*. arXiv:2205.05300
- 라이선스: MIT
- 구성: 댓글 50,000개(train 40,000 / validation 5,000 / test 5,000), 라벨 44개(감정 43 + ‘없음’). 다중 라벨이다.

### 다운로드 방식

노트북 2단계(또는 `src/data/kote_download.py`의 `ensure_kote_raw`)가 `configs/kote_source.json`에 고정한 revision으로 다음 파일을 받는다.

| 파일 | 출처 | 용도 |
|---|---|---|
| `train.tsv`, `val.tsv`, `test.tsv` | GitHub (commit `cafd2c3`) | 공식 분할 데이터 |
| `raw.json` | Hugging Face (commit `66f0eef`) | 평가자 5명의 원시 주석 |
| `kote.py` → `kote_loader_script.py.txt` | Hugging Face | 라벨 목록 확인용. **실행하지 않고** `ast`로 파싱만 함 |
| `dichotomized/*.parquet` | Hugging Face `refs/convert/parquet` | TSV 파싱 교차검증 |

- `datasets.load_dataset("searle-j/kote")`는 원격 로딩 스크립트 방식이라 최신 `datasets`에서 지원되지 않는다. 스크립트는 GitHub TSV를 탭 구분으로 읽는 것이 전부이므로 TSV를 직접 받는다. 그래서 `datasets` 패키지를 설치하지 않는다.
- 파일별 URL·revision·SHA-256·다운로드 시각은 `data/raw/kote/manifest.json`에 기록된다.
- **재실행하면 기존 파일을 재사용한다**: manifest의 SHA-256과 같으면 다시 받지 않는다. 강제로 다시 받으려면 `ensure_kote_raw(..., force=True)`를 쓴다.
- 원본 파일은 수정하지 않는다. 가공 결과는 `data/processed/kote/`에 따로 저장한다.

### 데이터를 Git에 올리지 않는 이유

- 원본은 공식 출처에서 언제든 같은 revision으로 다시 받을 수 있고, SHA-256으로 동일성을 확인할 수 있다.
- 원문 댓글이 들어 있고 용량이 크다(raw.json 약 40MB). 저장소 크기와 이력이 불필요하게 커진다.
- 같은 이유로 Git용 보고서와 노트북에는 KOTE 원문을 넣지 않는다. 원문이 필요한 사례는 `outputs/kote/`(Git 제외)에만 저장한다.

## 실행 순서

| 단계 | 명령 (저장소 루트, PowerShell) | 결과 |
|---|---|---|
| 1. 데이터 분석 | `.venv\Scripts\python ai\scripts\run_notebook.py` | KOTE 다운로드, `ai/data/processed/kote/`, `ai/outputs/kote/` |
| 2. 감정 모델 학습 | `.venv\Scripts\python ai\scripts\train_emotion_baseline.py` | `ai/checkpoints/emotion_baseline/<run>/`, `ai/outputs/emotion/<run>/` |
| 3. 성능 확인 | `.venv\Scripts\python ai\scripts\run_notebook.py --notebook ai\notebooks\02_emotion_baseline.ipynb --executed-out ai\outputs\emotion\02_emotion_baseline.executed.ipynb` | 학습 곡선, test 성능, 라벨·그룹별 성능 |
| 4. 모델 비교 | `.venv\Scripts\python ai\scripts\train_emotion_baseline.py --config ai\configs\emotion_klue_roberta_large.json --run-id klue_roberta_large_s42` (base도 같은 방식) 후 `.venv\Scripts\python ai\scripts\run_notebook.py --notebook ai\notebooks\04_model_comparison.ipynb --executed-out ai\outputs\emotion\04_model_comparison.executed.ipynb` | 성능 비교, bootstrap 신뢰구간, 앙상블, 속도 |
| 5. 개선 실험 | `.venv\Scripts\python ai\scripts\train_emotion.py --config ai\configs\exp_kc_mtsoft.json --seed 42 --run-id kc_mtsoft_s42` (실험별로 반복) 후 `.venv\Scripts\python ai\scripts\run_notebook.py --notebook ai\notebooks\05_improvement_experiments.ipynb --executed-out ai\outputs\emotion\05_improvement_experiments.executed.ipynb` | 2×2 실험, seed 변동, 앙상블 |

- 각 노트북은 VS Code에서 `.venv` 커널을 고르고 **Run All**로 실행해도 된다.
- `run_notebook.py`는 새 커널로 처음부터 실행하고, 출력이 포함된 실행본을 `--executed-out` 위치(Git 제외)에 저장한다. `--keep-outputs`를 주면 원본 노트북에도 출력을 남긴다(Git에 올리는 방식). 주지 않으면 원본의 출력을 지운다.
- 2단계 학습은 RTX 4060 Ti 기준 epoch당 약 3~4분이며 최대 10 epoch(조기 종료 있음)이다. 먼저 `--smoke`로 1분 정도의 동작 확인을 할 수 있다.
  다른 프로그램이 GPU 메모리를 많이 쓰면 Windows가 시스템 메모리로 넘겨 크게 느려질 수 있으니, 학습 중에는 GPU를 쓰는 프로그램을 줄인다.
- 02 노트북은 `RUN_ID = "baseline_v2021_s42"`(KcELECTRA)를 읽는다. 다른 모델을 보려면 `RUN_ID`를 바꾼다.
- 04 노트북은 세 실행(`baseline_v2021_s42`, `klue_roberta_base_s42`, `klue_roberta_large_s42`)이 모두 있어야 한다. KLUE-large 학습은 이 PC에서 약 2시간 걸린다.
- **노트북은 실행 결과를 남긴 채 올린다**(팀원이 GitHub에서 결과를 볼 수 있게). `--keep-outputs`로 실행하면 셀 코드·출력에 비밀값·개인 경로로 보이는 패턴이 있는지 자동으로 점검한다. 올리기 전에 출력에 KOTE 원문이나 실제 사용자 일기가 없는지도 확인한다.

## 캐시와 결과 저장 위치

| 위치 | 내용 | Git |
|---|---|---|
| `ai/.cache/huggingface/` | HF 토크나이저 등 캐시. `paths.configure_hf_cache()`가 `HF_HOME`, `HF_HUB_CACHE`, `HF_DATASETS_CACHE`를 여기로 지정 | 제외 |
| `ai/data/raw/kote/` | 원본 + `manifest.json` | 제외 |
| `ai/data/processed/kote/` | `{split}.parquet`, `{split}_multihot.npy`, `meta.json` | 제외 |
| `ai/outputs/kote/` | 상세 CSV, 그림, 실행 노트북, `summary.json` | 제외 |
| `ai/outputs/emotion/<run>/` | 학습 로그(`train.log`), `history.csv`, `metrics.json`, 예측 확률, 라벨별 성능, 그림 | 제외 |
| `ai/checkpoints/emotion/<run>/` | `train_emotion.py`로 학습한 모델(가중치·토크나이저·thresholds.json) | 제외 |
| `ai/checkpoints/emotion_baseline/<run>/` | **모델 가중치**(`model.safetensors`), 토크나이저, `thresholds.json` (`*.pt`, `*.safetensors` 등은 저장소 전체에서도 제외) | 제외 |
| `ai/configs/`, `ai/reports/`, `ai/src/`, `ai/notebooks/` | 설정, 요약 보고서, 코드, 실행 결과 포함 노트북 | **추적** |

토크나이저는 `beomi/KcELECTRA-base`의 토크나이저 파일만 받는다(`*.bin`, `*.safetensors` 제외).
기본 revision은 KOTE 공식 코드와 같은 `v2021`이다. `main`(2023 BBPE 토크나이저)은 `[CLS]/[SEP]`를 자동으로 붙이지 않아 이번 측정에서 제외했다(`configs/analysis.json` 참고).

## 재현 시 주의사항

- 출처 revision과 토크나이저 revision은 `configs/`에 고정되어 있다. 바꾸면 결과 수치가 달라질 수 있으니 보고서도 함께 갱신한다.
- 패키지 버전은 `requirements.txt`에 고정했다. pandas 3은 문자열 백엔드로 Arrow(RE2 정규식)를 쓰므로, 텍스트 패턴 검사는 엔진 차이가 없도록 Python `re`로 한다(`quality.py`).
- 한글 그래프는 설치된 글꼴 중 `configs/analysis.json`의 후보(맑은 고딕 등)를 자동으로 고른다. 글꼴이 없으면 경고가 출력된다.
- Windows에서 HF 캐시 symlink 경고가 나올 수 있다. 캐시가 파일 복사 방식으로 저장될 뿐 결과에는 영향이 없다.
- 실제 사용자 일기·사진은 이 분석에 쓰지 않았다. 앞으로도 사용자 데이터는 `ai/data/`(Git 제외) 밖에 두지 말고, 노트북 출력에 남기지 않는다.

## AI 추론 서비스·2단계 (작업 중)

감정 후처리, 행성 매핑 조정, 의미 임베딩·3D 위치, AI 서비스(`ai/service/`)와 백엔드·프론트 연동은 `feature/ai-service-draft` 브랜치(Draft PR)에서 작업 중이다. 로컬에서는 동작을 확인했지만 후처리·디자인·배포 위치가 정해지지 않아 main에는 아직 넣지 않는다.

## Git 관리 규칙

- 데이터(`ai/data/raw/`, `ai/data/processed/`), 결과(`ai/outputs/`), 캐시(`ai/.cache/`), 가중치(`ai/checkpoints/`, `*.pt`, `*.pth`, `*.ckpt`, `*.onnx`, `*.safetensors`), `.env`, 비밀키 파일은 루트 `.gitignore`로 제외한다.
- **`.gitignore`는 이미 추적 중인 파일에는 적용되지 않는다.** 실수로 커밋한 파일은 `git rm --cached <파일>`로 추적을 해제해야 한다.
- **`.gitignore`는 과거 커밋에 들어간 파일을 지우지 않는다.** 비밀값이 한 번이라도 커밋·푸시되었다면 파일 삭제만으로는 해결되지 않는다. 먼저 해당 키를 폐기·재발급하고, 필요하면 팀과 협의해 이력 정리를 검토한다.
- 커밋 전 순서: `git status` → `git diff` → 올릴 파일 선택 → `git add <선택한 파일>` → `git diff --cached` → commit → 기능 branch push → Pull Request.
  `git add .`이나 `git add ai/`처럼 한꺼번에 추가하지 말고, 파일을 명시해서 stage한다.
