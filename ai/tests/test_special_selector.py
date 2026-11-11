"""특수 행성 선택기·행성 설계 단위 확인 (모델 없이 가짜 임베딩으로).

실행 (저장소 루트): .venv/Scripts/python ai/tests/test_special_selector.py   (pytest로도 실행 가능)
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import numpy as np

AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))

from src.data.labels import load_label_names  # noqa: E402
from src.special.design import build_design  # noqa: E402
from src.special.selector import SpecialPlanetSelector, _josa, find_keywords, load_special, split_clauses  # noqa: E402

CFG = load_special(AI_ROOT / "configs" / "special_planet.json")
LABELS = load_label_names(AI_ROOT / "configs" / "kote_labels.json")


class FakeEncoder:
    """글자 해시로 만든 결정적 단위벡터. 실제 의미는 없고 흐름만 확인한다."""
    embedding_version = CFG["normalization"]["embedding_version"]

    def encode(self, texts):
        out = []
        for t in texts:
            rng = np.random.default_rng(abs(hash(t)) % (2 ** 32))
            v = rng.normal(size=16)
            out.append(v / np.linalg.norm(v))
        return np.array(out, np.float32)


def _probs(**labels):
    p = np.full(len(LABELS), 0.01)
    for name, v in labels.items():
        p[LABELS.index(name.replace("_", "/"))] = v
    return p


THR = np.full(len(LABELS), 0.3)


def test_keywords_and_clause_negation():
    ctx = CFG["context"]
    hits = {h.token: h.negated for h in find_keywords("바다 보러 가기로 했는데 결국 못 갔다. 집에 있었다.", ["바다"], ctx)}
    assert hits == {"바다": True}
    hits = {h.token: h.negated for h in find_keywords("졸업식이라 즐거웠지만, 이제 자주 못 본다.", ["졸업"], ctx)}
    assert hits == {"졸업식이라": False}  # 쉼표 뒤 절의 부정은 앞 절 키워드에 영향 없음
    assert find_keywords("그리고 집에 왔다", ["그립", "그리워"], ctx) == []  # '그리고'는 그리움이 아님
    assert split_clauses("바다에 갔다. 날씨가 좋았고, 물이 맑았다") == ["바다에 갔다.", "날씨가 좋았고,", "물이 맑았다"]


def test_josa():
    assert _josa("휴식", "과", "와") == "과" and _josa("성취", "과", "와") == "와"
    assert _josa("구름층", "이", "가") == "이" and _josa("물결 효과", "이", "가") == "가"


def test_disabled_without_encoder_gives_normal():
    sel = SpecialPlanetSelector(CFG, LABELS, encoder=None)
    out = sel.select_batch(["바다에 갔다"], [_probs()], THR, ["travel"])
    assert not sel.enabled and out[0]["special"] is False and out[0]["type"] is None
    assert out[0]["topic"] == "travel"


def test_disabled_when_embedding_version_differs():
    class Other(FakeEncoder):
        embedding_version = "other-model"
    sel = SpecialPlanetSelector(CFG, LABELS, encoder=Other())
    assert not sel.enabled and "임베딩 버전" in sel.disabled_reason


def _raw(topic=0.0, context=0.0, best="문장"):
    return {t: {"topic": topic, "context": context, "best_sentence": best} for t in CFG["types"]}


def test_score_ranges_and_user_topic_gate():
    sel = SpecialPlanetSelector(CFG, LABELS, encoder=FakeEncoder())
    lo = {t: CFG["normalization"]["topic"][t][0] for t in CFG["types"]}
    # 내용 주제 점수가 0(코사인이 중앙값 이하)이면 사용자가 주제를 골라도 bonus 없음 → 내용이 우선
    raw = _raw(topic=min(lo.values()) - 0.1)
    sc = sel.score("오늘 하루", _probs(), THR, raw, topic="travel")
    for v in sc.values():
        assert 0 <= v["T"] <= 1 and 0 <= v["E"] <= 1 and 0 <= v["C"] <= 1 and 0 <= v["S"] <= 1
    assert sc["ocean"]["detail"]["topic_bonus"] == 0
    # 내용도 바다와 관련 있으면(정규화 T ≥ gate) 관련 주제에만 bonus
    hi = CFG["normalization"]["topic"]["ocean"]
    raw = _raw(topic=hi[0] + 0.5 * (hi[1] - hi[0]))
    sc = sel.score("오늘 하루", _probs(), THR, raw, topic="travel")
    assert sc["ocean"]["detail"]["topic_bonus"] == CFG["user_topic"]["bonus"]
    assert sc["crystal"]["detail"]["topic_bonus"] == 0


def test_emotion_uses_only_passed_labels():
    sel = SpecialPlanetSelector(CFG, LABELS, encoder=FakeEncoder())
    raw = _raw()
    below = sel.score("x", _probs(뿌듯함=0.25), THR, raw)["crystal"]["E"]   # 기준값 0.3 미만 → 근거 아님
    above = sel.score("x", _probs(뿌듯함=0.9), THR, raw)["crystal"]["E"]
    assert below == 0 and abs(above - 0.9) < 1e-6


def test_decide_threshold_components_margin():
    sel = SpecialPlanetSelector(CFG, LABELS, encoder=FakeEncoder())
    base = {t: {"S": 0.1, "T": 0.1, "E": 0.1, "C": 0.1} for t in CFG["types"]}
    s = copy.deepcopy(base)
    s["ocean"] = {"S": 0.9, "T": 0.9, "E": 0.9, "C": 0.9}
    assert sel.decide(s)["special"]
    s["cloud"] = {"S": 0.88, "T": 0.9, "E": 0.9, "C": 0.9}       # 2위와 차이 < min_margin → 일반
    assert not sel.decide(s)["special"]
    s = copy.deepcopy(base)
    s["lava"] = {"S": 0.9, "T": 1.0, "E": 1.0, "C": 0.1}         # 문맥 근거 부족 → 일반
    assert not sel.decide(s)["special"]
    s["lava"] = {"S": CFG["threshold"] - 0.01, "T": 1, "E": 1, "C": 1}
    assert not sel.decide(s)["special"]


def test_explain_mentions_only_found_evidence():
    sel = SpecialPlanetSelector(CFG, LABELS, encoder=FakeEncoder())
    sc = {"S": 0.9, "T": 1, "E": 0.8, "C": 0.9, "detail": {
        "keywords": ["바다에"], "emotions": [{"label": "편안/쾌적", "prob": 0.8, "value": 0.8}], "topic_bonus": 0}}
    text = sel.explain("ocean", sc, None, True, {"checks": {}, "second": "cloud"})
    assert "'바다에'" in text and "'편안/쾌적'" in text and "물결 효과가 적용" in text
    sc["detail"].update(keywords=[], emotions=[])
    text = sel.explain("ocean", sc, None, True, {"checks": {}, "second": "cloud"})
    assert "'" not in text  # 찾지 않은 키워드·감정을 만들어 넣지 않는다


def test_build_design_keeps_emotion_core():
    visual = {"state": "clear", "primary": {"group": "joy", "name": "기쁨·즐거움"}, "base_color": "#FFC93C",
              "tone_color": "#FFD25A", "accents": [{"color": "#3FCF8E"}], "pattern": "bands"}
    before = copy.deepcopy(visual)
    sel = {"special": True, "type": "ocean", "candidate": "ocean", "score": 0.9, "threshold": CFG["threshold"],
           "margin": 0.3, "topic": None, "reason": "r", "checks": {}, "scores": {}, "version": "v"}
    d = build_design(visual, sel, CFG, size=0.7)
    assert visual == before
    assert d["planetType"] == "special" and d["specialType"] == "ocean"
    assert d["emotionCore"]["colors"] == ["#FFC93C", "#FFD25A", "#3FCF8E"] and d["emotionCore"]["size"] == 0.7
    assert d["specialEffects"]["waterAura"] and not d["specialEffects"]["lavaEnergy"]
    lo, hi = CFG["effect_parameters"]["intensity_range"]
    assert lo <= d["effectParameters"]["intensity"] <= hi
    n = build_design(visual, {**sel, "special": False, "type": None}, CFG)
    assert n["planetType"] == "normal" and n["specialType"] is None and not any(n["specialEffects"].values())
    assert n["effectParameters"] is None


if __name__ == "__main__":
    tests = [(k, v) for k, v in dict(globals()).items() if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        fn()
        print("ok", name)
    print(f"{len(tests)} passed")
