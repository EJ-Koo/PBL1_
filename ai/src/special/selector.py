"""Special Planet Selector (v0.1 시안): 일기 주제·감정·문맥 → 특수 행성 유형 또는 일반 행성.

새 모델을 학습하지 않고 기존 모델 출력만 다시 쓴다.
    - 감정: KcELECTRA 44개 라벨 확률과 라벨별 판정 기준값(행성 외형과 같은 값)
    - 의미: 2단계 임베딩 모델(KURE-v1, BAAI/bge-m3를 한국어로 미세조정한 모델)

점수 (유형 p마다, 모두 0~1)
    T_p 주제   = 일기 전체 임베딩 ↔ 유형 대표 주제 문장들의 중심 코사인 → 참조 코퍼스 백분위로 정규화
                 (+ 사용자가 고른 주제가 이 유형과 관련 있고 내용 점수도 gate 이상이면 bonus)
    E_p 감정   = max(라벨 가중치 × 라벨 확률), 모델이 판정한 라벨만 (성운은 '복합 감정' 항 추가)
    C_p 문맥   = keyword_weight × 키워드(부정 제외) + sentence_weight × 부정되지 않은 절 중 대표 사건 문장과 가장 가까운 절의 코사인(정규화)
    S_p = w_T·T_p + w_E·E_p + w_C·C_p
선택: S ≥ threshold, T·C ≥ min_components, 1위−2위 ≥ min_margin 일 때만 특수 행성. 아니면 일반 행성.

설정: configs/special_planet.json. 근거·한계: ai/reports/special_planet_v01_ko.md
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

_CLAUSE_SPLIT = re.compile(r"(?<=[.!?…~,])\s+|\n+")
_TOKEN = re.compile(r"[^\s.,!?…~\"'“”‘’()\[\]{}<>:;/·]+")
EPS = 1e-6


def load_special(path: Path) -> dict:
    """설정 + 정규화 범위 파일(normalization.values_file, 보정 스크립트가 만든 값)을 합친다."""
    path = Path(path)
    cfg = json.loads(path.read_text(encoding="utf-8"))
    values = path.parent / cfg["normalization"]["values_file"]
    if values.exists():
        cfg["normalization"].update(json.loads(values.read_text(encoding="utf-8")))
    return cfg


def split_clauses(text: str) -> list[str]:
    """문장 끝(. ! ? … ~ 줄바꿈)과 쉼표에서 나눈 절. 부정 표현의 범위와 문맥 유사도의 단위."""
    parts = [s.strip() for s in _CLAUSE_SPLIT.split(text.strip()) if s and s.strip()]
    parts = [s for s in parts if len(s) >= 4]
    return parts or [text.strip()]


def _is_negation(token: str, cfg: dict) -> bool:
    return token in cfg["negation_tokens"] or any(n in token for n in cfg["negation_contains"])


def clause_negated(clause: str, cfg: dict) -> bool:
    return any(_is_negation(t, cfg) for t in _TOKEN.findall(clause))


def _josa(word: str, with_final: str, without_final: str) -> str:
    """마지막 글자 받침 유무로 조사를 고른다(예: 휴식과 / 성취와, 구름층이 / 효과가)."""
    ch = word.rstrip()[-1:] or " "
    if "가" <= ch <= "힣":
        return with_final if (ord(ch) - ord("가")) % 28 else without_final
    return without_final


def _unit(v: np.ndarray) -> np.ndarray:
    return v / max(float(np.linalg.norm(v)), EPS)


def _norm(x: float, lo_hi) -> float:
    lo, hi = lo_hi
    return float(min(max((x - lo) / max(hi - lo, EPS), 0.0), 1.0))


@dataclass
class KeywordHit:
    keyword: str
    token: str
    negated: bool


def find_keywords(text: str, keywords: list[str], cfg: dict) -> list[KeywordHit]:
    """어절 앞부분 일치(기본) 또는 '~' 접두 키워드는 어절 안 어디든 일치. 같은 키워드는 한 번만 센다.
    키워드가 있는 절(쉼표·문장 끝까지)에서 키워드 뒤에 부정 표현이 있으면 negated
    (예: '바다 보러 가기로 했는데 태풍 때문에 결국 못 갔다' → '바다'는 세지 않음)."""
    hits: dict[str, KeywordHit] = {}

    def put(key: str, hit: KeywordHit) -> None:
        if key not in hits or (hits[key].negated and not hit.negated):
            hits[key] = hit

    for clause in split_clauses(text):
        toks = _TOKEN.findall(clause)
        neg_after = [False] * (len(toks) + 1)  # neg_after[i] = i번째 어절부터 절 끝까지 부정 표현이 있는가
        for i in range(len(toks) - 1, -1, -1):
            neg_after[i] = neg_after[i + 1] or _is_negation(toks[i], cfg)
        for kw in keywords:
            anywhere = kw.startswith("~")
            k = kw.lstrip("~")
            if " " in k:  # 띄어쓰기가 있는 표현은 절 원문에서 찾는다
                pos = clause.find(k)
                if pos >= 0:
                    put(k, KeywordHit(k, k, neg_after[len(_TOKEN.findall(clause[:pos]))]))
                continue
            for i, t in enumerate(toks):
                if (k in t) if anywhere else t.startswith(k):
                    put(k, KeywordHit(k, t, neg_after[i]))
    # '바다'와 '~바다'처럼 같은 어절을 두 번 세지 않는다
    seen_tokens: set[str] = set()
    out = []
    for h in hits.values():
        if h.token in seen_tokens:
            continue
        seen_tokens.add(h.token)
        out.append(h)
    return out


class SpecialPlanetSelector:
    def __init__(self, cfg: dict, label_names: list[str], encoder=None):
        """encoder: encode(list[str]) → (n, dim) 정규화 벡터, embedding_version 속성. None이면 선택기를 끈다."""
        self.cfg = cfg
        self.labels = label_names
        self.lidx = {n: i for i, n in enumerate(label_names)}
        self.types = list(cfg["types"])
        for t, tc in cfg["types"].items():
            missing = [lab for lab in tc["emotion_labels"] if lab not in self.lidx]
            if missing:
                raise ValueError(f"{t}: 라벨 이름이 kote_labels.json에 없습니다: {missing}")
        self.encoder = encoder
        self.disabled_reason: str | None = None
        norm = cfg["normalization"]
        if encoder is None:
            self.disabled_reason = "의미 임베딩 모델이 꺼져 있어 특수 행성 선택을 하지 않습니다."
        elif not norm.get("topic") or not norm.get("context"):
            self.disabled_reason = "정규화 범위가 비어 있습니다(calibrate_special_planet.py를 먼저 실행)."
        elif norm.get("embedding_version") != encoder.embedding_version:
            self.disabled_reason = (f"정규화에 쓴 임베딩 버전({norm.get('embedding_version')})이 현재 모델과 달라 "
                                    "특수 행성 선택을 하지 않습니다.")
        self._topic_c: dict[str, np.ndarray] = {}
        self._ctx_m: dict[str, np.ndarray] = {}
        if encoder is not None:
            self._prepare_prototypes()

    @property
    def enabled(self) -> bool:
        return self.disabled_reason is None

    @property
    def version(self) -> str:
        v = self.cfg["version"]
        ev = self.encoder.embedding_version if self.encoder is not None else "none"
        return f"special:{v}:{ev}"

    def _prepare_prototypes(self) -> None:
        for t, tc in self.cfg["types"].items():
            self._topic_c[t] = _unit(self.encoder.encode(tc["topic_prototypes"]).mean(0))
            self._ctx_m[t] = self.encoder.encode(tc["context_prototypes"])

    # ------------------------------------------------------------ 원시 유사도 (정규화 전, 보정 스크립트도 사용)
    def raw_similarities(self, texts: list[str]) -> list[dict]:
        """일기마다 {type: {"topic": cos, "context": cos, "best_sentence": str}}.
        topic = 일기 전체 ↔ 대표 주제 문장 중심. context = 부정 표현이 없는 절 중 대표 사건 문장과 가장 가까운 절의 코사인
        (부정된 절만 있으면 0 — 일어나지 않은 일을 사건으로 보지 않는다). 절은 한 번에 묶어 인코딩한다."""
        ccfg = self.cfg["context"]
        clauses = [split_clauses(t) for t in texts]
        flat = [c for cs in clauses for c in cs]
        doc = self.encoder.encode(texts)
        emb = self.encoder.encode(flat)
        out, k = [], 0
        for i, cs in enumerate(clauses):
            E = emb[k:k + len(cs)]
            k += len(cs)
            keep = np.array([not clause_negated(c, ccfg) for c in cs])
            row = {}
            for t in self.types:
                if keep.any():
                    sim = (E[keep] @ self._ctx_m[t].T).max(1)  # (절,) 가장 가까운 대표 사건 문장과의 코사인
                    j = int(np.argmax(sim))
                    ctx, best = float(sim[j]), [c for c, ok in zip(cs, keep) if ok][j]
                else:
                    ctx, best = 0.0, ""
                row[t] = {"topic": float(doc[i] @ self._topic_c[t]), "context": ctx, "best_sentence": best}
            out.append(row)
        return out

    # ------------------------------------------------------------ 점수
    def _emotion(self, t: str, p: np.ndarray, thr: np.ndarray, groups: list[dict] | None) -> tuple[float, list[dict]]:
        tc = self.cfg["types"][t]
        passed_only = self.cfg["emotion"]["use_passed_only"]
        evid = []
        for lab, w in tc["emotion_labels"].items():
            j = self.lidx[lab]
            if passed_only and p[j] < thr[j]:
                continue
            evid.append({"label": lab, "prob": round(float(p[j]), 4), "value": float(w * p[j])})
        evid.sort(key=lambda e: -e["value"])
        e = evid[0]["value"] if evid else 0.0
        if tc.get("use_mixed_emotion") and groups:
            mix = self._mixed(groups)
            if mix is not None and mix["value"] > e:
                e = mix["value"]
                evid.insert(0, mix)
        return float(min(e, 1.0)), evid[:3]

    def _mixed(self, groups: list[dict]) -> dict | None:
        """판정된 그룹 중 주 그룹과 쾌·불쾌가 반대인 가장 강한 그룹 → 복합 감정 항."""
        passed = [g for g in groups if g["passed"]]
        if len(passed) < 2:
            return None
        prim = max(passed, key=lambda g: g["score"])
        opp = [g for g in passed if g is not prim and g["valence"] * prim["valence"] < 0]
        if not opp:
            return None
        o = max(opp, key=lambda g: g["score"])
        w = self.cfg["emotion"]["mixed"]["weight"]
        return {"label": f"{prim['name']} + {o['name']}", "mixed": True, "groups": [prim["name"], o["name"]],
                "prob": round(o["score"], 4), "value": float(w * o["score"])}

    def score(self, text: str, p, thr, raw: dict, topic: str | None = None, groups: list[dict] | None = None) -> dict:
        """일기 1개 → 유형별 T·E·C·S와 근거. raw = raw_similarities의 한 행."""
        cfg = self.cfg
        p = np.asarray(p, np.float64)
        thr = np.asarray(thr, np.float64)
        w = cfg["weights"]
        ccfg = cfg["context"]
        norm = cfg["normalization"]
        ut = cfg["user_topic"]
        related = set(ut["topics"].get(topic, {}).get("related", [])) if topic else set()
        out = {}
        for t in self.types:
            tc = cfg["types"][t]
            t_text = _norm(raw[t]["topic"], norm["topic"][t])
            bonus = ut["bonus"] if (t in related and t_text >= ut["gate"]) else 0.0
            T = min(1.0, t_text + bonus)
            E, e_evid = self._emotion(t, p, thr, groups)
            hits = find_keywords(text, tc["keywords"], ccfg)
            pos = [h for h in hits if not h.negated]
            K = min(1.0, len(pos) / ccfg["keyword_saturation"])
            c_sent = _norm(raw[t]["context"], norm["context"][t])
            C = ccfg["keyword_weight"] * K + ccfg["sentence_weight"] * c_sent
            S = w["topic"] * T + w["emotion"] * E + w["context"] * C
            out[t] = {"S": round(S, 4), "T": round(T, 4), "E": round(E, 4), "C": round(C, 4),
                      "detail": {"topic_text": round(t_text, 4), "topic_bonus": bonus, "topic_cos": round(raw[t]["topic"], 4),
                                 "keyword": round(K, 4), "sentence": round(c_sent, 4), "sentence_cos": round(raw[t]["context"], 4),
                                 "best_sentence": raw[t]["best_sentence"],
                                 "keywords": [h.token for h in pos], "negated_keywords": [h.token for h in hits if h.negated],
                                 "emotions": e_evid}}
        return out

    def decide(self, scores: dict) -> dict:
        cfg = self.cfg
        mc = cfg["min_components"]
        order = sorted(scores, key=lambda t: -scores[t]["S"])
        best, second = order[0], order[1]
        sb, s2 = scores[best]["S"], scores[second]["S"]
        margin = round(sb - s2, 4)
        checks = {
            "threshold": sb >= cfg["threshold"],
            "topic_min": scores[best]["T"] >= mc["topic"],
            "context_min": scores[best]["C"] >= mc["context"],
            "margin": margin >= cfg["min_margin"],
        }
        return {"candidate": best, "score": sb, "second": second, "margin": margin, "checks": checks,
                "special": all(checks.values())}

    # ------------------------------------------------------------ 설명
    def explain(self, t: str, sc: dict, topic: str | None, special: bool, decision: dict) -> str:
        tc = self.cfg["types"][t]
        d = sc["detail"]
        if not special:
            failed = [k for k, ok in decision["checks"].items() if not ok]
            second = self.cfg["types"][decision["second"]]["name_ko"]
            why = {"threshold": f"적합도 {sc['S']:.2f} < 기준 {self.cfg['threshold']:.2f}",
                   "topic_min": "주제 관련성이 약함", "context_min": "관련 사건·문맥이 약함",
                   "margin": f"{second}{_josa(second, '과', '와')} 점수 차가 작아 유형이 불확실함"}
            return (f"특수 행성 조건을 만족하지 않아 일반 행성으로 표시합니다 "
                    f"(가장 가까운 유형: {tc['name_ko']}, {', '.join(why[k] for k in failed)}).")
        # 실제로 찾은 키워드(부정 제외)와 모델이 판정한 감정만 쓴다(분석하지 않은 내용을 덧붙이지 않음)
        kws = d["keywords"][:2]
        emo = [e for e in d["emotions"] if e["value"] > 0][:2]
        theme = tc["theme_ko"]
        if kws:
            lead = "일기에서 " + ", ".join(f"'{k}'" for k in kws) + f" 같은 표현과 {theme}에 관한 내용이 "
            lead += "나타났고," if emo else "나타나"
        else:
            lead = f"일기 내용이 {theme}{_josa(theme, '과', '와')} 가깝게 " + ("분석되었고," if emo else "분석되어")
        parts = [lead]
        if emo and emo[0].get("mixed"):
            a, b = emo[0]["groups"]
            parts.append(f"'{a}'{_josa(a, '과', '와')} '{b}'{_josa(b, '이', '가')} 섞인 복합 감정이 함께 분석되어")
        elif emo:
            parts.append(", ".join(f"'{e['label']}'" for e in emo) + " 감정이 함께 분석되어")
        if topic and d["topic_bonus"] > 0:
            name = self.cfg["user_topic"]["topics"][topic]["name"]
            parts.insert(0, f"선택한 주제 '{name}'{_josa(name, '과', '와')} 함께")
        effect = tc["effect_ko"]
        return " ".join(parts) + f" {effect}{_josa(effect, '이', '가')} 적용되었습니다."

    # ------------------------------------------------------------ 진입점
    def select_batch(self, texts: list[str], probs, thresholds, topics: list[str | None] | None = None,
                     groups_list: list[list[dict]] | None = None) -> list[dict]:
        topics = topics or [None] * len(texts)
        if not self.enabled:
            return [self._normal(self.disabled_reason, topic) for topic in topics]
        raws = self.raw_similarities(texts)
        out = []
        for i, (text, p, raw, topic) in enumerate(zip(texts, probs, raws, topics)):
            topic = topic if topic in self.cfg["user_topic"]["topics"] else None
            groups = groups_list[i] if groups_list else None
            scores = self.score(text, p, thresholds, raw, topic, groups)
            dec = self.decide(scores)
            t = dec["candidate"]
            special = dec["special"]
            out.append({
                "version": self.version,
                "special": special,
                "type": t if special else None,
                "candidate": t,
                "score": scores[t]["S"],
                "threshold": self.cfg["threshold"],
                "margin": dec["margin"],
                "checks": dec["checks"],
                "topic": topic,
                "reason": self.explain(t, scores[t], topic, special, dec),
                "scores": {k: {m: v[m] for m in ("S", "T", "E", "C")} for k, v in scores.items()},
                "evidence": scores[t]["detail"],
            })
        return out

    def _normal(self, reason: str, topic: str | None) -> dict:
        return {"version": self.version, "special": False, "type": None, "candidate": None, "score": None,
                "threshold": self.cfg["threshold"], "margin": None, "checks": None,
                "topic": topic if topic in self.cfg["user_topic"]["topics"] else None,
                "reason": reason, "scores": None, "evidence": None}
