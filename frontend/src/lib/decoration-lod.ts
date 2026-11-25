// [NEW FILE 2026-11-22] 꾸민 행성(특수 효과·표면 스타일)의 우주 화면 단계(LOD). 순수 함수라 테스트한다(tests/decoration-lod.test.mjs).
//
// 단계: 0 멀리(가벼움: 효과 정지·입자 없음, 표면 광택만) / 1 가까이(움직임·입자 일부) / 2 선택·미리보기와 같은 최고 단계
//
// matchPreview = true (기본, 2026-11-22): 상점·꾸미기 미리보기와 똑같이 보이도록 꾸민 행성은 거리와 상관없이 2.
//   꾸민 행성 수는 산 아이템 개수만큼이라 많지 않다. 그래도 기기 사양별 상한(maxFull)을 넘는 행성은 가까운 순서 밖이면 1.
//   먼 행성은 화면에서 작아 픽셀 계산이 적으므로, 단계를 올려도 비용은 주로 입자·움직임 정도다.
// matchPreview = false: 예전 규칙(가까운 순서로 maxNear 개·nearDistance 안만 1, 나머지 0).
// 두 경우 모두: 별자리 보기에서 어둡게 한 행성(dimmed)은 0, 별자리로 행성들이 움직이는 동안(moving)은 모두 0
// (기존 별자리 가독성·성능 규칙 우선). 선택한 행성은 효과·행성 쪽에서 바로 2로 그린다.

export type DecorationTier = 0 | 1 | 2;

export type DecorationLodOptions = {
  matchPreview: boolean;
  /** 최고 단계(2)로 그릴 꾸민 행성 수 상한(가까운 순서) */
  maxFull: number;
  /** 예전 규칙: 가까이(1)로 그릴 행성 수와 거리 */
  maxNear: number;
  nearDistance: number;
  moving?: boolean;
  dimmed?: ReadonlySet<string>;
};

/**
 * [2026-11-25] 상세 장식(별가루·별빛 잔해·위성 잔상·광륜 같은 추가 입자)을 켤 행성.
 * 전체 우주에서는 행성 특징(재질·고리·위성·별똥별 본체)만 두고 주변 장식은 간소화한다.
 * 카메라를 가까이 가져가 확대한 행성(detailDistance 안, 가까운 순서로 maxDetail 개)만 켠다. 선택한 행성·미리보기는 효과 쪽에서 바로 켠다.
 * 전환 중(moving)·별자리 밖(dimmed)은 끈다.
 */
export function detailIds(
  ranked: readonly { id: string; d: number }[],
  o: { maxDetail: number; detailDistance: number; moving?: boolean; dimmed?: ReadonlySet<string> }
): Set<string> {
  const out = new Set<string>();
  if (o.moving) return out;
  for (const r of ranked) {
    if (out.size >= o.maxDetail || r.d >= o.detailDistance) break;
    if (!o.dimmed?.has(r.id)) out.add(r.id);
  }
  return out;
}

/** ranked = 카메라에서 가까운 순서로 정렬한 꾸민 행성(id, 거리) */
export function decorationTiers(ranked: readonly { id: string; d: number }[], o: DecorationLodOptions): Map<string, DecorationTier> {
  const out = new Map<string, DecorationTier>();
  let count = 0;
  for (const r of ranked) {
    let tier: DecorationTier = 0;
    if (!o.moving && !o.dimmed?.has(r.id)) {
      if (o.matchPreview) {
        tier = count < o.maxFull ? 2 : 1;
        count++;
      } else if (count < o.maxNear && r.d < o.nearDistance) {
        tier = 1;
        count++;
      }
    }
    out.set(r.id, tier);
  }
  return out;
}
