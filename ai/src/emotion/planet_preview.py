"""행성 파라미터의 2D 미리보기(matplotlib). 실제 3D 렌더링은 프론트에서 하며, 이것은 설계 확인용이다."""
from __future__ import annotations

import numpy as np
from matplotlib.patches import Arc, Ellipse

SPACE_BG = "#0B1026"


def _rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def render_planet(ax, planet: dict, title: str | None = None, res: int = 220, seed: int = 0) -> None:
    ax.set_facecolor(SPACE_BG)
    ax.set_xlim(-1.6, 1.6)
    ax.set_ylim(-1.6, 1.6)
    ax.set_aspect("equal")
    ax.axis("off")
    r = 0.75 * planet["size_scale"]
    base = _rgb(planet["base_color"])
    accent = _rgb(planet["accent_color"]) if planet["accent_color"] else base

    # 빛 번짐(glow)
    for k in range(12, 0, -1):
        rr = r * (1 + 0.45 * planet["glow"] * k / 12)
        ax.add_patch(Ellipse((0, 0), 2 * rr, 2 * rr, color=base, alpha=0.05 * planet["glow"], lw=0))

    ring = planet["ring"]
    if ring["visible"]:  # 뒤쪽 고리
        ax.add_patch(Ellipse((0, 0), 3.6 * r, 0.9 * r, angle=-18, fill=False, lw=5,
                             color=_rgb(ring["color"]), alpha=0.35 * ring["opacity"] + 0.2, zorder=1))

    # 행성 표면: 띠(보조색) + 소용돌이(각성) + 조명
    y, x = np.mgrid[-1:1:res * 1j, -1:1:res * 1j]
    inside = x**2 + y**2 <= 1
    rng = np.random.default_rng(seed)
    phase = rng.uniform(0, 2 * np.pi)
    warp = planet["turbulence"] * 0.35 * np.sin(5 * x + phase) * np.cos(3 * y)
    bands = 0.5 + 0.5 * np.sin(np.pi * planet["band_count"] * (y + warp))
    mix = (bands * planet["accent_ratio"]).clip(0, 1)[..., None]  # 최대 섞임 = accent_ratio(≤0.5) → 기본색이 항상 우세
    color = base * (1 - mix) + accent * mix
    z = np.sqrt(np.clip(1 - x**2 - y**2, 0, 1))
    light = np.clip(0.35 + 0.75 * (-0.45 * x + 0.55 * y + 0.7 * z), 0.15, 1.15)[..., None]
    img = np.clip(color * light, 0, 1)
    rgba = np.dstack([img, inside.astype(float)])
    ax.imshow(rgba, extent=(-r, r, -r, r), origin="lower", zorder=2, interpolation="bilinear")

    if ring["visible"]:  # 앞쪽 고리: 행성 앞을 지나는 아래쪽 반만 다시 그림
        ax.add_patch(Arc((0, 0), 3.6 * r, 0.9 * r, angle=-18, theta1=180, theta2=360, lw=5,
                         color=_rgb(ring["color"]), alpha=0.5 * ring["opacity"] + 0.3, zorder=3))
    if title:
        ax.set_title(title, color="white", fontsize=9, pad=4)
