"""[NEW FILE 2026-11-15] 나만의 별자리(Level 4): 제한된 경로 데이터 → 행성 30개 좌표 + 연결선.

입력(LLM 이 JSON 으로 돌려준 값, 또는 아래 CATALOG 의 도안)
    strokes   = [{"part": "몸통", "role": "outline"|"detail", "closed": bool, "d": "M 10 50 C ..."}]
    keypoints = [{"name": "머리", "x": 12, "y": 48}]           # 100×100 캔버스, y 는 아래로(SVG 와 같다)

보안
    - SVG 문서·태그를 받지 않는다. 경로 문자열(d)만 받고, 허용 문자(명령 글자 M L H V Q C S T A Z·숫자·구분자)
      외에는 거절한다. 브라우저 DOM 에 넣지 않고 여기서 숫자 좌표로만 바꾼다(프론트는 좌표만 받는다).
    - 길이·명령 수·획 수·좌표 범위를 제한한다.

점 고르기(단순 균등 분할이 아님)
    1) 꼭 필요한 점: 열린 획의 양 끝
    2) 특징점(우선순위 순): 획이 다른 획에 닿는 곳(이음점) > LLM 이 표시한 특징점(머리·꼬리 등) > 크게 꺾이는 모서리
    3) 남은 개수는 '가장 긴 빈 구간의 가운데'에 하나씩 채운다(다른 점과 최소 간격 유지)
    → 머리·꼬리·지느러미 같은 특징이 먼저 자리를 잡고, 나머지 행성이 윤곽에 고르게 퍼진다.
연결선
    같은 획 위에서 이웃한 점끼리만 잇는다(윤곽선 먼저, 내부 구조선은 나중 → 그리는 순서도 같다).
    서로 다른 획이 닿는 곳은 같은 점(행성)으로 합쳐 모양이 이어진다.

검증: 점 30개, 유한한 좌표·범위, 최소 간격, 연결선 번호·중복, 연결선 수(≤40), 교차 수, 덩어리 수, 가로세로 비율.
출력 좌표는 프론트 템플릿과 같은 정규화 좌표(긴 쪽 반폭 = 1, y 가 위, z = 0).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

P = tuple[float, float]

REQUIRED_POINTS = 30
MAX_LINES = 40  # 프론트 CONSTELLATION_CONFIG.maxLines 와 같다

MAX_STROKES = 8
MAX_SUBPATHS = 10
MAX_D_CHARS = 1500
MAX_COMMANDS = 240
MAX_KEYPOINTS = 12
COORD_MIN, COORD_MAX = -20.0, 120.0

# 아래는 정규화 좌표(긴 쪽 반폭 = 1) 기준
MIN_STROKE_LENGTH = 0.12  # 이보다 짧은 획(점에 가까운 장식)은 버린다
MERGE_TOL = 0.07  # 서로 다른 획의 두 점이 이보다 가까우면 같은 행성으로 합친다
JUNCTION_TOL = 0.09  # 열린 획의 끝이 다른 획에 이만큼 가까우면 '이음점'
KEYPOINT_TOL = 0.15  # 특징점을 가장 가까운 획 위로 옮길 때 허용 거리
MIN_DIST_START = 0.14  # 점 사이 최소 간격(처음 목표) — 너무 가까우면 화면 배치가 커지고 행성이 겹친다
MIN_DIST_FLOOR = 0.075
VALID_MIN_DIST = 0.07
CORNER_MIN_DEG = 38.0
MAX_CROSSINGS = 2
MIN_ASPECT = 0.18
MAX_COMPONENTS = 4
ON_LINE_TOL = 0.035  # 점이 자기와 이어지지 않은 선에 이보다 가까우면 '선 위에 얹힌 점'

_ALLOWED_D = re.compile(r"^[MmLlHhVvQqCcSsTtAaZz0-9eE.,+\-\s]*$")
_TOKEN = re.compile(r"[MmLlHhVvQqCcSsTtAaZz]|[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?")
_ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "Q": 4, "C": 6, "S": 4, "T": 2, "A": 7, "Z": 0}


class ShapeError(ValueError):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


# ---------------------------------------------------------------------------- 경로 해석
def _check(v: float) -> float:
    if not math.isfinite(v) or v < COORD_MIN or v > COORD_MAX:
        raise ShapeError("coord_out_of_range", f"{v}")
    return v


def _bezier_pts(ctrl: list[P], n: int) -> list[P]:
    out = []
    for i in range(1, n + 1):
        t = i / n
        pts = list(ctrl)
        while len(pts) > 1:  # de Casteljau
            pts = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for a, b in zip(pts, pts[1:])]
        out.append(pts[0])
    return out


def _segments_for(ctrl: list[P]) -> int:
    est = sum(math.dist(a, b) for a, b in zip(ctrl, ctrl[1:]))
    return max(3, min(32, math.ceil(est / 2.0)))


def _arc_pts(p1: P, rx: float, ry: float, phi_deg: float, large: bool, sweep: bool, p2: P) -> list[P]:
    """SVG 타원 호(끝점 표기) → 점 목록. SVG 명세 F.6.5 의 중심 표기 변환."""
    (x1, y1), (x2, y2) = p1, p2
    if math.dist(p1, p2) < 1e-9:
        return []
    rx, ry = abs(rx), abs(ry)
    if rx < 1e-9 or ry < 1e-9:
        return [p2]
    phi = math.radians(phi_deg)
    c, s = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = c * dx + s * dy, -s * dx + c * dy
    lam = (x1p / rx) ** 2 + (y1p / ry) ** 2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        coef = -coef
    cxp, cyp = coef * rx * y1p / ry, -coef * ry * x1p / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        return math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)

    ux, uy = (x1p - cxp) / rx, (y1p - cyp) / ry
    t1 = ang(1, 0, ux, uy)
    dt = ang(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    n = max(4, min(32, math.ceil(abs(dt) * max(rx, ry) / 2.0)))
    out = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        out.append((c * x - s * y + cx, s * x + c * y + cy))
    return out


def parse_path(d: str, budget: list[int] | None = None) -> list[tuple[list[P], bool]]:
    """경로 문자열 → [(점 목록, 닫힘 여부)]. 허용하지 않는 문자·형식·크기는 ShapeError."""
    if not isinstance(d, str) or not d.strip():
        raise ShapeError("path_empty")
    if len(d) > MAX_D_CHARS:
        raise ShapeError("path_too_long", str(len(d)))
    if not _ALLOWED_D.match(d):
        raise ShapeError("path_bad_chars")
    budget = budget if budget is not None else [MAX_COMMANDS]
    toks = _TOKEN.findall(d)
    if not toks or not toks[0] in ("M", "m"):
        raise ShapeError("path_syntax", "must start with M")

    subpaths: list[tuple[list[P], bool]] = []
    cur: list[P] | None = None
    x = y = sx = sy = 0.0
    prev_ctrl: P | None = None
    prev_kind = ""
    cmd = ""
    i = 0

    def finish(closed: bool) -> None:
        nonlocal cur
        if cur and len(cur) >= 2:
            pts = cur
            if closed and math.dist(pts[0], pts[-1]) < 1e-6:
                pts = pts[:-1]
            subpaths.append((pts, closed and len(pts) >= 3))
            if len(subpaths) > MAX_SUBPATHS:
                raise ShapeError("too_many_subpaths")
        cur = None

    while i < len(toks):
        t = toks[i]
        if t[0].isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    finish(True)
                x, y = sx, sy
                prev_ctrl, prev_kind = None, "Z"
                continue
        elif not cmd or cmd in "Zz":
            raise ShapeError("path_syntax", "number without command")
        k = cmd.upper()
        n = _ARGS[k]
        if i + n > len(toks) or any(toks[j][0].isalpha() for j in range(i, i + n)):
            raise ShapeError("path_syntax", f"{cmd} needs {n} numbers")
        a = [float(toks[j]) for j in range(i, i + n)]
        i += n
        budget[0] -= 1
        if budget[0] < 0:
            raise ShapeError("path_too_complex")
        rel = cmd.islower()
        ox, oy = (x, y) if rel else (0.0, 0.0)

        if k == "M":
            if cur:
                finish(False)
            x, y = _check(a[0] + ox), _check(a[1] + oy)
            sx, sy = x, y
            cur = [(x, y)]
            cmd = "l" if rel else "L"  # M 뒤에 이어지는 좌표는 L
            prev_ctrl, prev_kind = None, "M"
            continue
        if cur is None:
            cur = [(x, y)]
        start = (x, y)
        if k in ("L", "H", "V"):
            if k == "L":
                x, y = a[0] + ox, a[1] + oy
            elif k == "H":
                x = a[0] + ox
            else:
                y = a[0] + oy
            pts = [(_check(x), _check(y))]
            prev_ctrl, prev_kind = None, "L"
        elif k in ("Q", "T"):
            if k == "Q":
                c1 = (_check(a[0] + ox), _check(a[1] + oy))
                end = (_check(a[2] + ox), _check(a[3] + oy))
            else:
                c1 = (2 * x - prev_ctrl[0], 2 * y - prev_ctrl[1]) if prev_kind == "Q" and prev_ctrl else start
                end = (_check(a[0] + ox), _check(a[1] + oy))
            pts = _bezier_pts([start, c1, end], _segments_for([start, c1, end]))
            prev_ctrl, prev_kind = c1, "Q"
            x, y = end
        elif k in ("C", "S"):
            if k == "C":
                c1 = (_check(a[0] + ox), _check(a[1] + oy))
                c2 = (_check(a[2] + ox), _check(a[3] + oy))
                end = (_check(a[4] + ox), _check(a[5] + oy))
            else:
                c1 = (2 * x - prev_ctrl[0], 2 * y - prev_ctrl[1]) if prev_kind == "C" and prev_ctrl else start
                c2 = (_check(a[0] + ox), _check(a[1] + oy))
                end = (_check(a[2] + ox), _check(a[3] + oy))
            pts = _bezier_pts([start, c1, c2, end], _segments_for([start, c1, c2, end]))
            prev_ctrl, prev_kind = c2, "C"
            x, y = end
        else:  # A
            if a[3] not in (0.0, 1.0) or a[4] not in (0.0, 1.0):
                raise ShapeError("path_syntax", "arc flags must be 0 or 1")
            end = (_check(a[5] + ox), _check(a[6] + oy))
            if abs(a[0]) > 200 or abs(a[1]) > 200:
                raise ShapeError("coord_out_of_range", "arc radius")
            pts = _arc_pts(start, a[0], a[1], a[2], bool(a[3]), bool(a[4]), end)
            prev_ctrl, prev_kind = None, "A"
            x, y = end
        cur.extend(pts)
    if cur:
        finish(False)
    return subpaths


# ---------------------------------------------------------------------------- 획(폴리라인)
@dataclass
class Stroke:
    pts: list[P]
    closed: bool
    role: str = "outline"
    part: str = ""
    cum: list[float] = field(default_factory=list)

    def __post_init__(self) -> None:
        # 연속된 같은 점 제거
        clean = [self.pts[0]]
        for p in self.pts[1:]:
            if math.dist(p, clean[-1]) > 1e-9:
                clean.append(p)
        self.pts = clean
        seq = clean + ([clean[0]] if self.closed else [])
        self.cum = [0.0]
        for a, b in zip(seq, seq[1:]):
            self.cum.append(self.cum[-1] + math.dist(a, b))

    @property
    def length(self) -> float:
        return self.cum[-1]

    def wrap(self, s: float) -> float:
        if self.closed and self.length > 0:
            return s % self.length
        return min(max(s, 0.0), self.length)

    def at(self, s: float) -> P:
        s = self.wrap(s)
        seq = self.pts + ([self.pts[0]] if self.closed else [])
        lo, hi = 0, len(self.cum) - 1
        while lo + 1 < hi:  # 이분 탐색
            mid = (lo + hi) // 2
            if self.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        seg = self.cum[hi] - self.cum[lo] or 1.0
        f = (s - self.cum[lo]) / seg
        a, b = seq[lo], seq[hi]
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

    def locate(self, p: P) -> tuple[float, float]:
        """p 에서 가장 가까운 획 위의 위치 (호 길이 s, 거리)."""
        seq = self.pts + ([self.pts[0]] if self.closed else [])
        best = (0.0, math.inf)
        for k, (a, b) in enumerate(zip(seq, seq[1:])):
            vx, vy = b[0] - a[0], b[1] - a[1]
            ll = vx * vx + vy * vy
            f = 0.0 if ll == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / ll))
            q = (a[0] + vx * f, a[1] + vy * f)
            dist = math.dist(p, q)
            if dist < best[1]:
                best = (self.cum[k] + math.sqrt(ll) * f, dist)
        return best

    def arc_gap(self, s1: float, s2: float) -> float:
        d = abs(s1 - s2)
        return min(d, self.length - d) if self.closed else d


def _turning(st: Stroke, s: float, h: float) -> float:
    a, b, c = st.at(s - h), st.at(s), st.at(s + h)
    v1 = (b[0] - a[0], b[1] - a[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n1, n2 = math.hypot(*v1), math.hypot(*v2)
    if n1 < 1e-9 or n2 < 1e-9:
        return 0.0
    cos = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.degrees(math.acos(cos))


def _corners(st: Stroke, h: float = 0.07) -> list[tuple[float, float]]:
    """크게 꺾이는 곳 [(s, 각도)] — 꼭짓점마다 앞뒤 h 만큼의 방향 변화, 주변(±h)에서 가장 큰 것만."""
    cand = []
    for s in st.cum[: len(st.pts)]:
        if not st.closed and (s < h or s > st.length - h):
            continue
        cand.append((s, _turning(st, s, h)))
    out = []
    for s, ang in cand:
        if ang < CORNER_MIN_DEG:
            continue
        if all(ang >= a2 for s2, a2 in cand if s2 != s and st.arc_gap(s, s2) <= h):
            if all(st.arc_gap(s, s3) > h for s3, _ in out):
                out.append((s, ang))
    return out


# ---------------------------------------------------------------------------- 정규화
def _normalize_strokes(raw: list[tuple[list[P], bool, str, str]], keypoints: list[tuple[str, P]]):
    xs = [p[0] for pts, *_ in raw for p in pts]
    ys = [p[1] for pts, *_ in raw for p in pts]
    if not xs:
        raise ShapeError("no_strokes")
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    half = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    if half < 1.0:
        raise ShapeError("shape_too_small")

    def tf(p: P) -> P:
        return ((p[0] - cx) / half, -(p[1] - cy) / half)  # SVG 는 y 가 아래 → 위로 뒤집는다

    strokes = [Stroke([tf(p) for p in pts], closed, role, part) for pts, closed, role, part in raw]
    kps = [(name, tf(p)) for name, p in keypoints]
    return strokes, kps


# ---------------------------------------------------------------------------- 점 고르기
@dataclass
class _Sel:
    stroke: int
    s: float
    pos: P
    prio: float
    kind: str


class _Sampler:
    def __init__(self, strokes: list[Stroke], n: int):
        self.strokes = strokes
        self.n = n
        self.sel: list[_Sel] = []
        self.min_dist = MIN_DIST_START

    # 같은 행성으로 합쳐질 점 묶음(서로 다른 획, MERGE_TOL 이내)
    def groups(self) -> list[int]:
        parent = list(range(len(self.sel)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i, a in enumerate(self.sel):
            for j in range(i + 1, len(self.sel)):
                b = self.sel[j]
                if a.stroke != b.stroke and math.dist(a.pos, b.pos) <= MERGE_TOL:
                    parent[find(j)] = find(i)
        return [find(i) for i in range(len(self.sel))]

    def unique(self) -> int:
        return len(set(self.groups()))

    def allowed(self, si: int, s: float, pos: P, min_dist: float) -> bool:
        st = self.strokes[si]
        for q in self.sel:
            d = math.dist(pos, q.pos)
            if q.stroke == si:
                if st.arc_gap(s, q.s) < min_dist * 0.9 or d < min_dist * 0.75:
                    return False
            elif MERGE_TOL < d < min_dist:
                return False
        return True

    def add(self, si: int, s: float, prio: float, kind: str, force: bool = False) -> bool:
        st = self.strokes[si]
        s = st.wrap(s)
        pos = st.at(s)
        if not force and not self.allowed(si, s, pos, self.min_dist):
            return False
        self.sel.append(_Sel(si, s, pos, prio, kind))
        return True

    def on(self, si: int) -> list[_Sel]:
        return sorted((q for q in self.sel if q.stroke == si), key=lambda q: q.s)

    def gaps(self) -> list[tuple[float, int, float]]:
        """[(점수, 획, 가운데 s)] — 같은 획에서 이웃한 점 사이 빈 구간."""
        out = []
        for si, st in enumerate(self.strokes):
            pts = self.on(si)
            weight = 1.0 if st.role == "outline" else 0.85
            if not pts:
                continue
            pairs = list(zip(pts, pts[1:]))
            for a, b in pairs:
                out.append(((b.s - a.s) * weight, si, (a.s + b.s) / 2))
            if st.closed:
                g = st.length - pts[-1].s + pts[0].s
                out.append((g * weight, si, pts[-1].s + g / 2))
        out.sort(key=lambda t: -t[0])
        return out

    def fill_one(self) -> bool:
        while True:
            for score, si, mid in self.gaps():
                if score < 1e-6:
                    break
                st = self.strokes[si]
                for off in (0.0, -0.18, 0.18):  # 가운데가 안 되면 조금 옆
                    if self.add(si, mid + off * score, 0.0, "fill"):
                        return True
            if self.min_dist <= MIN_DIST_FLOOR + 1e-9:
                return False
            self.min_dist = max(MIN_DIST_FLOOR, self.min_dist * 0.88)


def sample_shape(
    strokes: list[Stroke], keypoints: list[tuple[str, P]], n: int = REQUIRED_POINTS
) -> tuple[list[list[float]], list[list[int]], dict]:
    sm = _Sampler(strokes, n)

    # 1) 열린 획의 양 끝
    for si, st in enumerate(strokes):
        if not st.closed:
            sm.add(si, 0.0, 10.0, "end", force=True)
            sm.add(si, st.length, 10.0, "end", force=True)

    # 2) 특징점 후보
    feats: list[tuple[float, int, float, str]] = []
    for si, st in enumerate(strokes):  # 이음점: 열린 획의 끝이 다른 획에 닿는 곳
        if st.closed:
            continue
        for end in (st.pts[0], st.pts[-1]):
            for ti, other in enumerate(strokes):
                if ti == si:
                    continue
                s, dist = other.locate(end)
                if dist <= JUNCTION_TOL:
                    feats.append((8.0, ti, s, "junction"))
    for _name, p in keypoints:  # LLM 이 표시한 특징점(머리·꼬리 등) → 가장 가까운 획 위
        best = min(((st.locate(p), si) for si, st in enumerate(strokes)), key=lambda t: t[0][1])
        (s, dist), si = best
        if dist <= KEYPOINT_TOL:
            feats.append((6.0, si, s, "keypoint"))
    for si, st in enumerate(strokes):  # 크게 꺾이는 모서리
        for s, ang in _corners(st):
            feats.append((2.0 + ang / 90.0 + (0.3 if st.role == "outline" else 0.0), si, s, "corner"))
    feats.sort(key=lambda t: -t[0])
    for prio, si, s, kind in feats:
        if sm.unique() >= n:
            break
        sm.add(si, s, prio, kind)

    # 3) 닫힌 획은 최소 3점
    for si, st in enumerate(strokes):
        if st.closed:
            have = sm.on(si)
            if not have:
                sm.add(si, 0.0, 1.0, "fill", force=True)
            while len(sm.on(si)) < 3:
                pts = sm.on(si)
                g = [(b.s - a.s, (a.s + b.s) / 2) for a, b in zip(pts, pts[1:])]
                g.append((st.length - pts[-1].s + pts[0].s, pts[-1].s + (st.length - pts[-1].s + pts[0].s) / 2))
                sm.add(si, max(g)[1], 1.0, "fill", force=True)

    # 4) 남은 개수 채우기
    while sm.unique() < n:
        if not sm.fill_one():
            raise ShapeError("not_enough_room", f"{sm.unique()} points")

    # 5) 많으면 우선순위 낮은 점부터 뺀다(획 최소 점 수는 지킨다)
    while sm.unique() > n:
        removable = []
        for k, q in enumerate(sm.sel):
            st = strokes[q.stroke]
            minimum = 3 if st.closed else 2
            if q.kind == "end" or len(sm.on(q.stroke)) <= minimum:
                continue
            removable.append((q.prio, k))
        if not removable:
            raise ShapeError("too_many_required_points")
        sm.sel.pop(min(removable)[1])

    # 6) 행성 번호 매기기(획 순서 → 획 위 순서) + 연결선
    groups = sm.groups()
    order: dict[int, int] = {}
    pos_of: dict[int, P] = {}
    for si, st in enumerate(strokes):
        for q in sm.on(si):
            g = groups[sm.sel.index(q)]
            if g not in order:
                order[g] = len(order)
            # 같은 행성으로 합친 점은 윤곽선 쪽 위치를 쓴다(획 순서상 먼저 나온 쪽)
            pos_of.setdefault(g, q.pos)
    edges: list[list[int]] = []
    seen: set[tuple[int, int]] = set()

    def link(a: int, b: int) -> None:
        if a == b:
            return
        key = (min(a, b), max(a, b))
        if key not in seen:
            seen.add(key)
            edges.append([a, b])

    for si, st in enumerate(strokes):
        ids = [order[groups[sm.sel.index(q)]] for q in sm.on(si)]
        for a, b in zip(ids, ids[1:]):
            link(a, b)
        if st.closed and len(ids) >= 3:
            link(ids[-1], ids[0])

    pts = [None] * len(order)
    for g, idx in order.items():
        pts[idx] = pos_of[g]
    points = _renormalize(pts)  # type: ignore[arg-type]
    stats = {
        "features": sum(1 for q in sm.sel if q.kind in ("junction", "keypoint", "corner")),
        "keypoints_used": sum(1 for q in sm.sel if q.kind == "keypoint"),
        "min_dist_target": round(sm.min_dist, 3),
    }
    return points, edges, stats


def _renormalize(pts: list[P]) -> list[list[float]]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    half = max(max(xs) - min(xs), max(ys) - min(ys)) / 2 or 1.0
    return [[round((x - cx) / half, 3) + 0.0, round((y - cy) / half, 3) + 0.0, 0.0] for x, y in pts]


# ---------------------------------------------------------------------------- 검증
def _segments_cross(p1: P, p2: P, p3: P, p4: P) -> bool:
    def orient(a, b, c):
        v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        return 0 if abs(v) < 1e-12 else (1 if v > 0 else -1)

    o1, o2, o3, o4 = orient(p1, p2, p3), orient(p1, p2, p4), orient(p3, p4, p1), orient(p3, p4, p2)
    return o1 * o2 < 0 and o3 * o4 < 0


def _seg_dist(p, a, b) -> tuple[float, float]:
    """점 p 와 선분 ab 의 거리, 그리고 선분 위 투영 위치 t(0~1)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t


def min_clearance(points: list, connections: list) -> float:
    """각 점과 그 점에 닿지 않은 선 사이의 가장 짧은 거리."""
    best = math.inf
    for i, p in enumerate(points):
        for a, b in connections:
            if i != a and i != b:
                best = min(best, _seg_dist(p, points[a], points[b])[0])
    return best


def split_on_lines(points: list, connections: list) -> list[list[int]]:
    """다른 선 위에 얹힌 점(T자 이음)이 있으면 그 선을 점에서 나눠 a-점-b 로 잇는다."""
    seen: set[tuple[int, int]] = set()
    out: list[list[int]] = []

    def add(a: int, b: int) -> None:
        key = (min(a, b), max(a, b))
        if a != b and key not in seen:
            seen.add(key)
            out.append([a, b])

    for a, b in connections:
        on = []
        for i, p in enumerate(points):
            if i in (a, b):
                continue
            d, t = _seg_dist(p, points[a], points[b])
            if d < ON_LINE_TOL and 0.0 < t < 1.0:
                on.append((t, i))
        chain = [a] + [i for _, i in sorted(on)] + [b]
        for u, v in zip(chain, chain[1:]):
            add(u, v)
    return out


def count_crossings(points: list[list[float]], edges: list[list[int]]) -> int:
    n = 0
    for i, (a, b) in enumerate(edges):
        for c, d in edges[i + 1 :]:
            if len({a, b, c, d}) < 4:
                continue
            if _segments_cross(tuple(points[a][:2]), tuple(points[b][:2]), tuple(points[c][:2]), tuple(points[d][:2])):
                n += 1
    return n


def validate_constellation(points: list, connections: list, n: int = REQUIRED_POINTS) -> list[str]:
    """문제 목록(비어 있으면 통과). DB 에서 읽은 값·생성 결과 모두 이 함수로 확인한다."""
    problems: list[str] = []
    if not isinstance(points, list) or len(points) != n:
        return [f"point_count:{len(points) if isinstance(points, list) else 'invalid'}"]
    for p in points:
        if (
            not isinstance(p, list)
            or len(p) != 3
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in p)
            or max(abs(p[0]), abs(p[1])) > 1.05
            or abs(p[2]) > 1.0
        ):
            return ["bad_coordinate"]
    if not isinstance(connections, list) or not connections:
        return ["no_connections"]
    seen = set()
    for e in connections:
        if not isinstance(e, list) or len(e) != 2 or not all(isinstance(v, int) for v in e):
            return ["bad_connection"]
        a, b = e
        if not (0 <= a < n and 0 <= b < n) or a == b:
            return ["bad_connection_index"]
        key = (min(a, b), max(a, b))
        if key in seen:
            problems.append("duplicate_connection")
        seen.add(key)
    if len(connections) > MAX_LINES:
        problems.append(f"too_many_lines:{len(connections)}")
    min_d = min(math.dist(points[i][:2], points[j][:2]) for i in range(n) for j in range(i + 1, n))
    if min_d < VALID_MIN_DIST:
        problems.append(f"points_too_close:{min_d:.3f}")
    used = {v for e in connections for v in e}
    if len(used) < n:
        problems.append(f"isolated_points:{n - len(used)}")
    crossings = count_crossings(points, connections)
    if crossings > MAX_CROSSINGS:
        problems.append(f"crossings:{crossings}")
    clearance = min_clearance(points, connections)
    if clearance < ON_LINE_TOL * 0.85:
        problems.append(f"point_on_line:{clearance:.3f}")
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    if min(w, h) / max(w, h, 1e-9) < MIN_ASPECT:
        problems.append("too_flat")
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in connections:
        parent[find(a)] = find(b)
    comps = len({find(i) for i in range(n)})
    if comps > MAX_COMPONENTS:
        problems.append(f"too_many_parts:{comps}")
    return problems


# ---------------------------------------------------------------------------- 전체
def build_constellation(spec: dict, n: int = REQUIRED_POINTS) -> dict:
    """{"strokes": [...], "keypoints": [...]} → {"points", "connections", "stats"}. 실패하면 ShapeError(문제 설명 포함)."""
    if not isinstance(spec, dict):
        raise ShapeError("bad_spec")
    raw_strokes = spec.get("strokes")
    if not isinstance(raw_strokes, list) or not raw_strokes:
        raise ShapeError("no_strokes")
    if len(raw_strokes) > MAX_STROKES:
        raise ShapeError("too_many_strokes", str(len(raw_strokes)))
    budget = [MAX_COMMANDS]
    raw: list[tuple[list[P], bool, str, str]] = []
    for item in raw_strokes:
        if not isinstance(item, dict):
            raise ShapeError("bad_stroke")
        role = "detail" if item.get("role") == "detail" else "outline"
        part = str(item.get("part") or "")[:30]
        for pts, closed in parse_path(item.get("d", ""), budget):
            raw.append((pts, closed or bool(item.get("closed")) and len(pts) >= 3, role, part))
    if len(raw) > MAX_SUBPATHS:
        raise ShapeError("too_many_subpaths")
    keypoints: list[tuple[str, P]] = []
    for kp in (spec.get("keypoints") or [])[:MAX_KEYPOINTS]:
        try:
            keypoints.append((str(kp.get("name") or "")[:30], (_check(float(kp["x"])), _check(float(kp["y"])))))
        except (KeyError, TypeError, ValueError, ShapeError):
            continue

    strokes, kps = _normalize_strokes(raw, keypoints)
    strokes = [s for s in strokes if s.length >= MIN_STROKE_LENGTH and len(s.pts) >= 2]
    if not any(s.role == "outline" for s in strokes):
        if not strokes:
            raise ShapeError("no_strokes")
        strokes[0].role = "outline"
    # 윤곽선 먼저, 같은 종류면 긴 획 먼저(행성 번호·선 그리는 순서)
    strokes.sort(key=lambda s: (s.role != "outline", -s.length))
    strokes = strokes[:MAX_STROKES]

    points, connections, stats = sample_shape(strokes, kps, n)
    connections = split_on_lines(points, connections)
    problems = validate_constellation(points, connections, n)
    if problems:
        raise ShapeError("invalid_shape", ", ".join(problems))
    stats["crossings"] = count_crossings(points, connections)
    stats["strokes"] = len(strokes)
    return {"points": points, "connections": connections, "stats": stats}


# ---------------------------------------------------------------------------- 방법 B: 미리 만든 도안
def _lobed(cx: float, cy: float, r: float, amp: float, lobes: int, steps: int = 60) -> str:
    pts = []
    for k in range(steps):
        t = 2 * math.pi * k / steps
        rr = r + amp * math.cos(lobes * t)
        pts.append((cx + rr * math.sin(t), cy - rr * math.cos(t)))
    return "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"


def _o(d: str, part: str = "") -> dict:
    return {"part": part, "role": "outline", "closed": True, "d": d}


def _det(d: str, part: str = "", closed: bool = False) -> dict:
    return {"part": part, "role": "detail", "closed": closed, "d": d}


# LLM 이 그린 모양을 끝내 쓰지 못할 때 쓰는 도안(콘셉트와 가장 가까운 것). 100×100 캔버스, y 아래.
CATALOG: dict[str, dict] = {
    "whale": {
        "label": "고래",
        "strokes": [
            _o("M 6 54 C 8 36 30 28 52 30 C 68 32 78 40 86 46 L 95 33 L 92 50 L 97 64 L 86 56 "
               "C 76 66 54 72 32 70 C 16 69 6 63 6 54 Z", "몸통"),
            _det("M 34 66 L 42 82 L 50 68", "지느러미"),
            _det("M 12 16 C 16 22 20 26 22 32 C 24 26 28 22 34 16", "물줄기"),
        ],
        "keypoints": [{"name": "머리", "x": 6, "y": 54}, {"name": "꼬리 위", "x": 95, "y": 33},
                      {"name": "꼬리 아래", "x": 97, "y": 64}],
    },
    "fish": {
        "label": "물고기",
        "strokes": [
            _o("M 8 50 C 24 26 54 24 72 46 L 94 28 L 88 50 L 94 72 L 72 54 C 54 76 24 74 8 50 Z", "몸통"),
            _det("M 30 36 C 35 45 35 55 30 64", "아가미"),
            _det("M 42 29 L 52 14 L 62 33", "등지느러미"),
        ],
        "keypoints": [{"name": "입", "x": 8, "y": 50}, {"name": "꼬리 위", "x": 94, "y": 28},
                      {"name": "꼬리 아래", "x": 94, "y": 72}],
    },
    "bird": {
        "label": "새",
        "strokes": [
            _o("M 6 46 L 20 40 C 32 32 50 34 60 42 L 90 30 L 80 48 L 94 60 L 62 56 C 50 66 30 64 22 54 Z", "몸통"),
            _det("M 34 40 C 40 26 50 14 66 8 C 62 24 58 34 54 42", "날개"),
        ],
        "keypoints": [{"name": "부리", "x": 6, "y": 46}, {"name": "날개 끝", "x": 66, "y": 8},
                      {"name": "꼬리", "x": 92, "y": 44}],
    },
    "cat": {
        "label": "고양이",
        "strokes": [
            _o("M 30 94 C 20 80 20 62 30 52 C 25 44 25 34 30 26 L 28 6 L 41 19 C 47 17 53 17 59 19 L 72 6 "
               "L 70 26 C 75 34 75 44 70 52 C 80 62 80 80 70 94 Z", "몸"),
            _det("M 70 90 C 86 88 94 74 86 60", "꼬리"),
        ],
        "keypoints": [{"name": "왼쪽 귀", "x": 28, "y": 6}, {"name": "오른쪽 귀", "x": 72, "y": 6}],
    },
    "tree": {
        "label": "나무",
        "strokes": [
            _o("M 50 66 C 30 70 12 60 16 44 C 8 30 22 12 40 15 C 46 3 64 5 66 17 C 82 14 94 30 86 46 "
               "C 92 62 70 70 50 66 Z", "수관"),
            _det("M 44 66.5 L 42 96", "줄기"),
            _det("M 56 66.5 L 58 96", "줄기"),
        ],
        "keypoints": [{"name": "꼭대기", "x": 55, "y": 6}],
    },
    "flower": {
        "label": "꽃",
        "strokes": [
            _o(_lobed(50, 32, 22, 13, 5), "꽃잎"),
            _det("M 50 54 L 50 97", "줄기"),
            _det("M 50 84 C 58 72 72 70 82 72 C 76 84 64 88 50 84 Z", "잎", True),
        ],
        # 꽃잎 끝 5개(반지름이 가장 큰 곳)
        "keypoints": [{"name": f"꽃잎{k + 1}", "x": 50 + 35 * math.sin(2 * math.pi * k / 5),
                       "y": 32 - 35 * math.cos(2 * math.pi * k / 5)} for k in range(5)],
    },
    "house": {
        "label": "집",
        "strokes": [
            _o("M 12 50 L 50 14 L 88 50 L 77 50 L 77 92 L 23 92 L 23 50 Z", "지붕과 벽"),
            _det("M 42 92 L 42 70 L 58 70 L 58 92", "문"),
            _det("M 30 58 L 38 58 L 38 66 L 30 66 Z", "창문", True),
            _det("M 64 34 L 64 20 L 72 20 L 72 41", "굴뚝"),
        ],
        "keypoints": [{"name": "지붕 꼭대기", "x": 50, "y": 14}],
    },
    "sailboat": {
        "label": "돛단배",
        "strokes": [
            _o("M 10 70 L 90 70 L 76 88 L 24 88 Z", "배"),
            _o("M 50 8 L 50 64 L 16 64 Z", "큰 돛"),
            _o("M 60 20 L 60 62 L 84 62 Z", "작은 돛"),
        ],
        "keypoints": [{"name": "돛대 끝", "x": 50, "y": 8}],
    },
    "cup": {
        "label": "찻잔",
        "strokes": [
            _o("M 20 36 L 74 36 L 68 90 L 26 90 Z", "잔"),
            _det("M 72 48 C 94 48 94 78 69 78", "손잡이"),
            _det("M 36 28 C 30 20 42 14 36 4", "김"),
            _det("M 56 28 C 50 20 62 14 56 4", "김"),
        ],
        "keypoints": [],
    },
    "bread": {
        "label": "빵",
        "strokes": [
            _o("M 8 76 C 4 52 18 32 40 28 C 54 20 74 22 84 34 C 96 42 96 64 92 76 Z", "빵"),
            _det("M 28 40 L 40 56", "칼집"),
            _det("M 48 32 L 60 50", "칼집"),
            _det("M 68 32 L 78 48", "칼집"),
        ],
        "keypoints": [],
    },
    "sneaker": {
        "label": "운동화",
        "strokes": [
            _o("M 6 80 L 6 60 C 6 50 14 46 24 46 L 34 28 C 40 22 50 24 54 32 L 62 46 C 76 50 90 54 96 66 "
               "L 96 80 Z", "신발"),
            _det("M 32 38 L 46 40 L 38 46 L 52 48", "끈"),
        ],
        "keypoints": [{"name": "앞코", "x": 96, "y": 70}, {"name": "뒤꿈치", "x": 6, "y": 80}],
    },
    "robot": {
        "label": "로봇",
        "strokes": [
            _o("M 26 42 L 74 42 L 74 80 L 26 80 Z", "몸"),
            _o("M 32 10 L 68 10 L 68 34 L 32 34 Z", "머리"),
            _det("M 26 50 L 8 68", "왼팔"),
            _det("M 74 50 L 92 68", "오른팔"),
            _det("M 38 80 L 38 97", "왼다리"),
            _det("M 62 80 L 62 97", "오른다리"),
        ],
        "keypoints": [],
    },
    "balloon": {
        "label": "열기구",
        "strokes": [
            _o("M 50 4 C 78 4 88 30 76 50 L 60 66 L 40 66 L 24 50 C 12 30 22 4 50 4 Z", "풍선"),
            _o("M 40 80 L 60 80 L 58 94 L 42 94 Z", "바구니"),
            _det("M 40 66 L 40 80", "줄"),
            _det("M 60 66 L 60 80", "줄"),
        ],
        "keypoints": [{"name": "꼭대기", "x": 50, "y": 4}],
    },
}

CATALOG_KEYS = list(CATALOG.keys())


def build_from_catalog(key: str, n: int = REQUIRED_POINTS) -> dict:
    spec = CATALOG.get(key) or CATALOG["balloon"]
    return build_constellation({"strokes": spec["strokes"], "keypoints": spec["keypoints"]}, n)
