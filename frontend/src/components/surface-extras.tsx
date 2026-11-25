// [NEW FILE 2026-11-25] 표면 스타일의 모양(실루엣) 부품. 색·재질은 surface-shader.ts, 여기서는 지오메트리만.
//  - 크리스탈: 깎은 다면체 몸통(정이십면체를 한 번 나눈 80면). 꼭짓점은 행성 반지름 위 → 크기 그대로.
//    면마다 무게중심 좌표(aBary)를 붙여 셰이더가 모서리에 가는 빛줄을 그린다.
//  - 솜사탕 구름: [2026-11-26] 둘레에 작은 구 덩어리를 붙이던 방식(조각·비늘처럼 보임)을 없앴다. 이제 별도 부품 없이
//    몸통 정점 셰이더가 큰 구름 덩어리로 부풀리고(surface-shader.ts CLOUD_VERTEX), 외곽은 몸통 가장자리를 반투명하게 해서
//    안개처럼 번진다(CLOUD_SHAPE.edgeSoft).
import { BufferAttribute, IcosahedronGeometry } from 'three';

/** 크리스탈 몸통: 80면 다면체 + 면마다 무게중심 좌표 aBary((1,0,0),(0,1,0),(0,0,1)) */
export function createFacetedGeometry(radius: number) {
  const g = new IcosahedronGeometry(radius, 1); // 면마다 꼭짓점이 따로인(인덱스 없는) 지오메트리
  const n = g.getAttribute('position').count;
  const bary = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) bary[i * 3 + (i % 3)] = 1;
  g.setAttribute('aBary', new BufferAttribute(bary, 3));
  return g;
}

