// [NEW FILE 2026-11-26] 솜사탕 구름(Pastel Cloud) 표면의 색 줄 흐림. 순수 함수라 테스트한다(tests/surface-style.test.mjs).
/**
 * [2026-11-26] 솜사탕 구름 색: 감정 색 줄(RGBA, 길이 texels)을 넓게 흐린 사본. 감정 색과 그 비율은 그대로이고,
 * 가는 층이 사라져 2~4개의 큰 색 영역이 부드럽게 이어진다(솜사탕의 분홍 → 노랑 → 하늘처럼). 가장자리는 끝 색을 이어 쓴다.
 * sigma: 줄 길이 대비 흐림 폭(가우시안 표준편차).
 */
export function softenStrip(data: Uint8Array, texels: number, sigma = 0.07): Uint8Array {
  const s = Math.max(1, sigma * texels);
  const r = Math.ceil(s * 3);
  const w = Array.from({ length: r * 2 + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * s * s)));
  const out = new Uint8Array(data.length);
  for (let x = 0; x < texels; x++) {
    let sum = 0;
    const acc = [0, 0, 0, 0];
    for (let k = -r; k <= r; k++) {
      const j = Math.min(texels - 1, Math.max(0, x + k));
      const wk = w[k + r];
      for (let c = 0; c < 4; c++) acc[c] += data[j * 4 + c] * wk;
      sum += wk;
    }
    for (let c = 0; c < 4; c++) out[x * 4 + c] = Math.round(acc[c] / sum);
  }
  return out;
}
