# 오늘의별일 — AI 파트 (`ai/`)

사진과 텍스트로 쓴 일기 하나를 3D 행성 하나로 표현하는 서비스에서, AI 파트는 다음을 맡는다.

| 기능 | 역할 | 상태 |
|---|---|---|
| 일기 감정 분석 | 감정 → 행성 외형 | **데이터 분석 완료(KOTE)**, 모델 학습 전 |
| 의미 임베딩 | 관련 기억 검색, 별자리 연결 | 예정 |
| 공간 알고리즘 | 행성 위치 | 예정 |

이번 단계에서는 KOTE 데이터셋의 구조·품질·분포를 분석했다. 결과 요약은 [reports/kote_analysis_ko.md](reports/kote_analysis_ko.md)에 있다.

## 폴더 구성

```
ai/
├── notebooks/01_data_analysis.ipynb   # KOTE 분석 (Git에는 출력 없는 상태로 올림)
├── src/
│   ├── data/                          # 다운로드·로딩·라벨 변환·품질 점검 함수
│   │   ├── paths.py                   #   경로, HF 캐시(ai/.cache) 설정
│   │   ├── kote_download.py           #   공식 출처 다운로드 + SHA-256 manifest
│   │   ├── kote_load.py               #   TSV/Parquet/raw.json 로딩
│   │   ├── labels.py                  #   라벨 대응, 44차원 multi-hot, 원시 주석 집계
│   │   ├── quality.py                 #   품질 플래그, 최소 정규화, 텍스트 패턴
│   │   └── tokenizer_utils.py         #   토크나이저 파일만 받아 토큰 길이 측정
│   ├── emotion/  embedding/  clustering/  positioning/   # 향후 기능 위치 (현재 비어 있음)
├── scripts/run_notebook.py            # 노트북 전체 실행 → 실행본 저장 → 원본 출력 정리
├── configs/                           # Git 관리: 출처 revision, 공식 라벨 대응, 분석 설정
│   ├── kote_source.json
│   ├── kote_labels.json
│   └── analysis.json
├── reports/kote_analysis_ko.md        # Git 관리: 원문 없는 요약 보고서
├── requirements.txt
│
├── data/raw/kote/          # (Git 제외) 원본 다운로드
├── data/processed/kote/    # (Git 제외) 가공 결과 (parquet, multi-hot npy)
├── outputs/kote/           # (Git 제외) 상세 CSV, 그림, 출력 포함 실행 노트북
├── checkpoints/            # (Git 제외) 향후 모델 가중치
└── .cache/                 # (Git 제외) Hugging Face 캐시
```

Git에서 제외되는 폴더는 노트북을 실행하면 자동으로 만들어진다.

## 환경 설정

Python 3.13에서 검증했다(Windows 11). 이 단계는 CPU만 사용하며 PyTorch/CUDA가 필요 없다.
가상환경은 저장소 루트의 `.venv/`(Git 제외)를 쓴다.

```powershell
# 저장소 루트(PBL1_)에서
python -m venv .venv
.venv\Scripts\Activate.ps1          # Git Bash: source .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r ai/requirements.txt
```

macOS/Linux에서는 `python3 -m venv .venv && source .venv/bin/activate`를 쓴다.

### VS Code에서 Jupyter 커널 선택

1. 확장 프로그램 **Python**, **Jupyter**를 설치한다.
2. `ai/notebooks/01_data_analysis.ipynb`를 연다.
3. 오른쪽 위 **Select Kernel** → **Python Environments** → `.venv (Python 3.13.x)`를 고른다.
   보이지 않으면 `Ctrl+Shift+P` → `Python: Select Interpreter` → `.\.venv\Scripts\python.exe`를 고른 뒤 다시 시도한다.
4. **Run All**을 누른다. 노트북은 저장소 루트·`ai/`·`ai/notebooks/` 어디에서 실행해도 경로를 같게 잡는다.

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

## 분석 실행 순서

1. 위의 환경 설정을 마친다.
2. 분석 노트북 실행. 둘 중 하나를 쓴다.
   - VS Code에서 `ai/notebooks/01_data_analysis.ipynb`를 열고 **Run All**
   - 터미널(저장소 루트): `.venv\Scripts\python ai\scripts\run_notebook.py`
     → 새 커널로 처음부터 실행하고, 출력이 포함된 실행본을 `ai/outputs/kote/01_data_analysis.executed.ipynb`에 저장한 뒤, 원본 노트북의 출력·실행 번호·메타데이터를 정리한다.
3. 결과 확인: `ai/outputs/kote/`(CSV, `figures/*.png`, `summary.json`), `ai/data/processed/kote/`
4. **커밋 전**: VS Code에서 직접 실행했다면 `.venv\Scripts\python ai\scripts\run_notebook.py --strip-only`로 원본 노트북의 출력을 지운다.

## 캐시와 결과 저장 위치

| 위치 | 내용 | Git |
|---|---|---|
| `ai/.cache/huggingface/` | HF 토크나이저 등 캐시. `paths.configure_hf_cache()`가 `HF_HOME`, `HF_HUB_CACHE`, `HF_DATASETS_CACHE`를 여기로 지정 | 제외 |
| `ai/data/raw/kote/` | 원본 + `manifest.json` | 제외 |
| `ai/data/processed/kote/` | `{split}.parquet`, `{split}_multihot.npy`, `meta.json` | 제외 |
| `ai/outputs/kote/` | 상세 CSV, 그림, 실행 노트북, `summary.json` | 제외 |
| `ai/checkpoints/` | **향후 모델 가중치 저장 위치** (`*.pt`, `*.safetensors` 등은 저장소 전체에서도 제외) | 제외 |
| `ai/configs/`, `ai/reports/`, `ai/src/`, `ai/notebooks/` | 설정, 요약 보고서, 코드, 출력 없는 노트북 | **추적** |

토크나이저는 `beomi/KcELECTRA-base`의 토크나이저 파일만 받는다(`*.bin`, `*.safetensors` 제외).
기본 revision은 KOTE 공식 코드와 같은 `v2021`이다. `main`(2023 BBPE 토크나이저)은 `[CLS]/[SEP]`를 자동으로 붙이지 않아 이번 측정에서 제외했다(`configs/analysis.json` 참고).

## 재현 시 주의사항

- 출처 revision과 토크나이저 revision은 `configs/`에 고정되어 있다. 바꾸면 결과 수치가 달라질 수 있으니 보고서도 함께 갱신한다.
- 패키지 버전은 `requirements.txt`에 고정했다. pandas 3은 문자열 백엔드로 Arrow(RE2 정규식)를 쓰므로, 텍스트 패턴 검사는 엔진 차이가 없도록 Python `re`로 한다(`quality.py`).
- 한글 그래프는 설치된 글꼴 중 `configs/analysis.json`의 후보(맑은 고딕 등)를 자동으로 고른다. 글꼴이 없으면 경고가 출력된다.
- Windows에서 HF 캐시 symlink 경고가 나올 수 있다. 캐시가 파일 복사 방식으로 저장될 뿐 결과에는 영향이 없다.
- 실제 사용자 일기·사진은 이 분석에 쓰지 않았다. 앞으로도 사용자 데이터는 `ai/data/`(Git 제외) 밖에 두지 말고, 노트북 출력에 남기지 않는다.

## Git 관리 규칙

- 데이터(`ai/data/raw/`, `ai/data/processed/`), 결과(`ai/outputs/`), 캐시(`ai/.cache/`), 가중치(`ai/checkpoints/`, `*.pt`, `*.pth`, `*.ckpt`, `*.onnx`, `*.safetensors`), `.env`, 비밀키 파일은 루트 `.gitignore`로 제외한다.
- **`.gitignore`는 이미 추적 중인 파일에는 적용되지 않는다.** 실수로 커밋한 파일은 `git rm --cached <파일>`로 추적을 해제해야 한다.
- **`.gitignore`는 과거 커밋에 들어간 파일을 지우지 않는다.** 비밀값이 한 번이라도 커밋·푸시되었다면 파일 삭제만으로는 해결되지 않는다. 먼저 해당 키를 폐기·재발급하고, 필요하면 팀과 협의해 이력 정리를 검토한다.
- 커밋 전 순서: `git status` → `git diff` → 올릴 파일 선택 → `git add <선택한 파일>` → `git diff --cached` → commit → 기능 branch push → Pull Request.
  `git add .`이나 `git add ai/`처럼 한꺼번에 추가하지 말고, 파일을 명시해서 stage한다.
