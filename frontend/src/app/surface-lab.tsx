// [NEW FILE 2026-11-21] 표면 스타일 비교 화면(개발·검증용). 주소: /surface-lab
//  - 같은 일기 행성(같은 AI 감정 분석 결과)을 기본 + 5개 표면 스타일로 나란히 그린다.
//  - 위쪽 표에 그 일기의 감정 분석 결과·색·무늬·크기·위치를 적는다(스타일과 무관하게 하나뿐인 값).
//  - 조합(표면 + 특수 효과)과 성능 측정(한 화면 36개 행성, 단계별 그리기 시간)도 볼 수 있다.
//  - [2026-11-21] 특수 효과 8종(기존 5 + 신규 3) 비교 줄, 표면 × 신규 효과 조합, 효과 행성 10·30·50·100개 성능 측정.
//  - 개발 서버(__DEV__)나 EXPO_PUBLIC_SURFACE_LAB=1 일 때만 열린다. 운영 화면에서는 홈으로 돌아간다.
// 이 화면은 아무것도 저장하지 않는다(서버 호출 없음, 로그인한 내 일기 목록만 읽는다).
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { EffectSwapTest, SurfaceBenchmark, SurfaceCompareRow, type BenchmarkResult, type SurfaceCompareCell } from '@/components/universe-scene';
import { planetRadiusForText, type PlanetVisual } from '@/lib/planet-visual';
import { EFFECT_LABELS, NEW_SPECIAL_TYPES, SAMPLE_PLANET, SPECIAL_TYPES, isNewSpecialType, type SpecialType } from '@/lib/special-planet';
import { SURFACE_STYLES, SURFACE_STYLE_IDS, type SurfaceStyle, type SurfaceTier } from '@/lib/surface-style';
import { useDiary, type DiaryEntry } from '@/store/diary-context';

const LAB_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_SURFACE_LAB === '1';

const COLUMNS: (SurfaceStyle | null)[] = [null, ...SURFACE_STYLE_IDS];

const COMBOS: { label: string; surface: SurfaceStyle | null; effect: SpecialType | null }[] = [
  { label: '기본 + 바다 효과', surface: null, effect: 'ocean' },
  { label: 'Opal Glass + 바다', surface: 'opal_glass', effect: 'ocean' },
  { label: 'Pearl Silk + 성운', surface: 'pearl_silk', effect: 'nebula' },
  { label: 'Crystal Prism + 수정', surface: 'crystal_prism', effect: 'crystal' },
  { label: 'Aurora Ribbon + 효과 없음', surface: 'aurora_ribbon', effect: null },
];

// [2026-11-21] 특수 효과 비교: 효과 없음 + 8종(앞 5개 기존, 뒤 3개 신규)
const EFFECT_COLUMNS: (SpecialType | null)[] = [null, ...SPECIAL_TYPES];
const NEW_COMBOS: { label: string; surface: SurfaceStyle | null; effect: SpecialType | null }[] = [
  { label: '기본 + 천상의 고리', surface: null, effect: 'celestial_ring' },
  { label: 'Opal Glass + 천상의 고리', surface: 'opal_glass', effect: 'celestial_ring' },
  { label: 'Pearl Silk + 공전하는 위성', surface: 'pearl_silk', effect: 'orbiting_moons' },
  { label: 'Crystal Prism + 별똥별', surface: 'crystal_prism', effect: 'shooting_stars' },
];

const TIER_LABELS: Record<SurfaceTier, string> = { 0: '0 멀리(경량)', 1: '1 가까이(중간)', 2: '2 선택(고품질)' };

/** 감정 그룹이 서로 다른 일기를 골라 비교 줄을 만든다(보조 감정이 있는 일기를 먼저). */
function pickEntries(entries: DiaryEntry[], n: number): { id: string; text: string; visual: PlanetVisual; position?: [number, number, number] }[] {
  const analyzed = entries.filter((e) => e.planet.version !== 'fallback' && e.planet.primary.group);
  const sorted = [...analyzed].sort((a, b) => b.planet.accents.length - a.planet.accents.length);
  const seen = new Set<string>();
  const out: DiaryEntry[] = [];
  for (const e of sorted) {
    if (seen.has(e.planet.primary.group)) continue;
    seen.add(e.planet.primary.group);
    out.push(e);
    if (out.length >= n) break;
  }
  if (out.length === 0) return [{ id: 'lab-sample', text: '샘플 행성(로그인한 일기의 AI 분석 결과가 없을 때)', visual: SAMPLE_PLANET }];
  return out.map((e) => ({ id: e.id, text: e.text, visual: e.planet, position: e.position }));
}

function Swatch({ color }: { color: string }) {
  return <View style={[styles.swatch, { backgroundColor: color }]} />;
}

function AnalysisLine({ row }: { row: ReturnType<typeof pickEntries>[number] }) {
  const v = row.visual;
  return (
    <View style={styles.analysis} testID={`lab-analysis-${row.id}`}>
      <Text style={styles.analysisText} numberOfLines={1}>
        “{row.text}”
      </Text>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisKey}>주 감정</Text>
        <Swatch color={v.base_color} />
        <Text style={styles.analysisVal}>
          {v.primary.name} ({v.primary.group}) {v.base_color} · 무늬 {v.pattern} · 상태 {v.state}
        </Text>
      </View>
      <View style={styles.analysisRow}>
        <Text style={styles.analysisKey}>보조 감정</Text>
        {v.accents.length === 0 ? <Text style={styles.analysisVal}>없음</Text> : null}
        {v.accents.map((a) => (
          <View key={`${a.group}-${a.slot}`} style={styles.analysisRow}>
            <Swatch color={a.color} />
            <Text style={styles.analysisVal}>
              {a.name} {(a.weight * 100).toFixed(1)}%{'  '}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.analysisVal}>
        크기(반지름) {planetRadiusForText(row.text).toFixed(3)}
        {row.position ? ` · 위치 (${row.position.map((n) => n.toFixed(2)).join(', ')})` : ''}
        {' · 모든 스타일에서 같은 값'}
      </Text>
    </View>
  );
}

type BenchItem = {
  key: string;
  label: string;
  surface: SurfaceStyle | null;
  tier: SurfaceTier;
  count: number;
  effects?: (SpecialType | null)[];
  surfaces?: (SurfaceStyle | null)[];
  full?: boolean;
};
type BenchResult = BenchItem & BenchmarkResult;
const SURFACE_PLAN: BenchItem[] = [
  { key: 'base-0', label: '기본(기존)', surface: null, tier: 0, count: 36 },
  ...SURFACE_STYLE_IDS.flatMap((s) =>
    ([0, 1, 2] as SurfaceTier[]).map((tier) => ({ key: `${s}-${tier}`, label: SURFACE_STYLES[s].en, surface: s, tier, count: 36 }))
  ),
];
// [2026-11-21] 효과 행성 수별: 효과 없음 / 기존 5종을 돌아가며 / 신규 3종을 돌아가며. 단계는 1개 선택·6개 가까이·나머지 멀리.
// [2026-11-22] '미리보기와 같게' = 꾸민 행성 모두 최고 단계(우주 화면 기본값). '거리별' = 예전 규칙(1 선택·6 가까이·나머지 멀리).
const CLASSIC5: SpecialType[] = ['ocean', 'cloud', 'crystal', 'nebula', 'lava'];
const EFFECT_SETS: { key: string; label: string; effects: (SpecialType | null)[]; surfaces?: (SurfaceStyle | null)[]; full?: boolean }[] = [
  { key: 'none', label: '효과 없음', effects: [null] },
  { key: 'classic', label: '기존 5종(거리별)', effects: CLASSIC5 },
  { key: 'new', label: '신규 3종(거리별)', effects: [...NEW_SPECIAL_TYPES] },
  { key: 'classic-full', label: '기존 5종(미리보기와 같게)', effects: CLASSIC5, full: true },
  { key: 'new-full', label: '신규 3종(미리보기와 같게)', effects: [...NEW_SPECIAL_TYPES], full: true },
  { key: 'all-full', label: '표면5+효과8(미리보기와 같게)', effects: [...SPECIAL_TYPES], surfaces: [...SURFACE_STYLE_IDS], full: true },
];
const EFFECT_PLAN: BenchItem[] = [10, 30, 50, 100].flatMap((count) =>
  EFFECT_SETS.map((set) => ({
    key: `fx-${set.key}-${count}`,
    label: `${set.label} × ${count}`,
    surface: null,
    tier: 0 as SurfaceTier,
    count,
    effects: set.effects,
    surfaces: set.surfaces,
    full: set.full,
  }))
);

export default function SurfaceLab() {
  const { entries } = useDiary();
  const [tier, setTier] = useState<SurfaceTier>(2);
  const rows = useMemo(() => pickEntries(entries, 4), [entries]);
  const [bench, setBench] = useState<{ plan: BenchItem[]; index: number; results: BenchResult[] } | null>(null);
  // [2026-11-21] 효과 교체 정리 확인: 효과 없음 → 8종 → … 3바퀴, 바꿀 때마다 GPU 지오메트리 수
  const [swap, setSwap] = useState<'idle' | 'running' | { effect: string; geometries: number; textures: number }[]>('idle');

  if (!LAB_ENABLED) return <Redirect href="/" />;

  const running = bench && bench.index < bench.plan.length ? bench.plan[bench.index] : null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} testID="surface-lab">
      <Text style={styles.title}>표면 스타일 비교 (개발용)</Text>
      <Text style={styles.note}>
        같은 일기 = 같은 AI 감정 분석 결과(색·무늬·보조 감정 비율·크기·위치)입니다. 표면 스타일은 그 결과를 입력으로 재질만 바꿉니다.
        맨 왼쪽 「기본」은 기존 행성과 같은 셰이더입니다.
      </Text>
      <View style={styles.tierRow}>
        <Text style={styles.analysisKey}>표면 단계</Text>
        {([0, 1, 2] as SurfaceTier[]).map((t) => (
          <Pressable key={t} testID={`lab-tier-${t}`} onPress={() => setTier(t)} style={[styles.tierBtn, tier === t && styles.tierBtnOn]}>
            <Text style={[styles.tierText, tier === t && styles.tierTextOn]}>{TIER_LABELS[t]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.headerRow}>
        {COLUMNS.map((c) => (
          <Text key={c ?? 'base'} style={styles.colHead}>
            {c ? `${SURFACE_STYLES[c].en}\n${SURFACE_STYLES[c].scope === 'finish' ? '광택만' : '겹침 ≤35%'}` : '기본\n(기존 행성)'}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.id} style={styles.block}>
          <View style={styles.canvasRow} testID={`lab-row-${row.id}`}>
            {/* 성능 측정 중에는 다른 3D 화면을 내려 측정이 섞이지 않게 한다 */}
            {running ? null : <SurfaceCompareRow
              tier={tier}
              cells={COLUMNS.map<SurfaceCompareCell>((surface) => ({
                key: `${row.id}-${surface ?? 'base'}`,
                id: row.id,
                visual: row.visual,
                surface,
                effect: null,
              }))}
            />}
          </View>
          <AnalysisLine row={row} />
        </View>
      ))}

      <Text style={styles.section}>표면 + 특수 효과 조합 (첫 번째 일기)</Text>
      <View style={styles.headerRow}>
        {COMBOS.map((c) => (
          <Text key={c.label} style={styles.colHead}>
            {c.label}
          </Text>
        ))}
      </View>
      <View style={[styles.canvasRow, styles.comboRow]} testID="lab-combos">
        {running ? null : <SurfaceCompareRow
          tier={tier}
          cells={COMBOS.map<SurfaceCompareCell>((c) => ({
            key: c.label,
            id: rows[0].id,
            visual: rows[0].visual,
            surface: c.surface,
            effect: c.effect,
          }))}
        />}
      </View>

      <Text style={styles.section}>특수 효과 8종 (첫 번째 일기 · 앞 5개 기존, 뒤 3개 신규)</Text>
      <View style={styles.headerRow}>
        {EFFECT_COLUMNS.map((e) => (
          <Text key={e ?? 'none'} style={styles.colHead}>
            {e ? `${EFFECT_LABELS[e].icon} ${EFFECT_LABELS[e].name}${isNewSpecialType(e) ? ' (신규)' : ''}` : '효과 없음 (기본 행성)'}
          </Text>
        ))}
      </View>
      <View style={[styles.canvasRow, styles.effectRow]} testID="lab-effects">
        {running ? null : (
          <SurfaceCompareRow
            tier={tier}
            cells={EFFECT_COLUMNS.map<SurfaceCompareCell>((effect) => ({
              key: `fx-${effect ?? 'none'}`,
              id: rows[0].id,
              visual: rows[0].visual,
              surface: null,
              effect,
            }))}
          />
        )}
      </View>

      <Text style={styles.section}>표면 × 신규 효과 조합 (두 번째 일기)</Text>
      <View style={styles.headerRow}>
        {NEW_COMBOS.map((c) => (
          <Text key={c.label} style={styles.colHead}>
            {c.label}
          </Text>
        ))}
      </View>
      <View style={[styles.canvasRow, styles.comboRow]} testID="lab-new-combos">
        {running ? null : (
          <SurfaceCompareRow
            tier={tier}
            cells={NEW_COMBOS.map<SurfaceCompareCell>((c) => ({
              key: `new-${c.label}`,
              id: (rows[1] ?? rows[0]).id,
              visual: (rows[1] ?? rows[0]).visual,
              surface: c.surface,
              effect: c.effect,
            }))}
          />
        )}
      </View>

      <Text style={styles.section}>성능 측정 (1프레임 그리기 + GPU 완료 대기, 4번 평균 · 측정 중에는 위 3D 화면을 내린다)</Text>
      <View style={styles.tierRow}>
        <Pressable
          testID="lab-bench-start"
          disabled={!!running}
          onPress={() => setBench({ plan: SURFACE_PLAN, index: 0, results: [] })}
          style={[styles.tierBtn, styles.benchBtn]}>
          <Text style={styles.tierText}>표면 스타일 (행성 36개)</Text>
        </Pressable>
        <Pressable
          testID="lab-bench-effects"
          disabled={!!running}
          onPress={() => setBench({ plan: EFFECT_PLAN, index: 0, results: [] })}
          style={[styles.tierBtn, styles.benchBtn]}>
          <Text style={styles.tierText}>특수 효과 (행성 10·30·50·100개)</Text>
        </Pressable>
        {running && bench ? (
          <Text style={styles.analysisVal}>
            측정 중… {bench.index + 1}/{bench.plan.length} {running.label}
          </Text>
        ) : null}
      </View>
      {running ? (
        <View style={styles.benchCanvas}>
          <SurfaceBenchmark
            key={running.key}
            visual={rows[0].visual}
            surface={running.surface}
            tier={running.tier}
            count={running.count}
            effects={running.effects}
            surfaces={running.surfaces}
            full={running.full}
            onResult={(r) => setBench((b) => (b ? { ...b, index: b.index + 1, results: [...b.results, { ...running, ...r }] } : b))}
          />
        </View>
      ) : null}
      <View style={styles.tierRow}>
        <Pressable
          testID="lab-swap-start"
          disabled={swap === 'running' || !!running}
          onPress={() => setSwap('running')}
          style={[styles.tierBtn, styles.benchBtn]}>
          <Text style={styles.tierText}>효과 교체 정리 확인 (같은 행성 효과 9가지 × 3바퀴)</Text>
        </Pressable>
      </View>
      {swap === 'running' ? (
        <View style={styles.benchCanvas}>
          <EffectSwapTest
            visual={rows[0].visual}
            sequence={[0, 1, 2].flatMap(() => [null, ...SPECIAL_TYPES])}
            onResult={(r) => setSwap(r)}
          />
        </View>
      ) : null}
      {Array.isArray(swap) ? (
        <Text style={styles.analysisVal} testID="lab-swap-result">
          {swap.map((r) => `${r.effect}:${r.geometries}`).join(' → ')}
        </Text>
      ) : null}
      {bench && bench.results.length > 0 ? (
        <View style={styles.table} testID="lab-bench-table">
          {bench.results.map((r) => (
            <Text key={r.key} style={styles.analysisVal} testID={`lab-bench-${r.key}`}>
              {r.label}
              {r.effects ? '' : ` 단계 ${r.tier}`} · 평균 {r.avg.toFixed(2)}ms · 95% {r.p95.toFixed(2)}ms · 호출 {r.calls} · 삼각형{' '}
              {r.triangles.toLocaleString()} · 지오메트리 {r.geometries} · 셰이더 {r.programs}
              {r.heapMB != null ? ` · JS 힙 ${r.heapMB.toFixed(0)}MB` : ''}
            </Text>
          ))}
          {bench.index >= bench.plan.length ? (
            <Text style={styles.analysisVal} testID="lab-bench-done">
              측정 끝
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#05050c' },
  content: { padding: 16, paddingBottom: 60 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  note: { color: '#9C9CC0', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tierBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#3A3A4A' },
  tierBtnOn: { backgroundColor: '#FED240', borderColor: '#FED240' },
  tierText: { color: '#c8c8d8', fontSize: 12, fontWeight: 'bold' },
  tierTextOn: { color: '#000' },
  headerRow: { flexDirection: 'row' },
  colHead: { flex: 1, color: '#c8c8d8', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  block: { marginBottom: 14 },
  canvasRow: { height: 240, backgroundColor: '#000', borderRadius: 10, overflow: 'hidden' },
  comboRow: { height: 300 },
  effectRow: { height: 220 },
  analysis: { marginTop: 6, gap: 3 },
  analysisText: { color: '#fff', fontSize: 12 },
  analysisRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  analysisKey: { color: '#FED240', fontSize: 11, fontWeight: 'bold', marginRight: 4 },
  analysisVal: { color: '#c8c8d8', fontSize: 11 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ffffff55' },
  section: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginTop: 18, marginBottom: 8 },
  benchBtn: { alignSelf: 'flex-start', marginBottom: 8 },
  benchCanvas: { height: 260, backgroundColor: '#000', marginBottom: 8 },
  table: { gap: 2, marginTop: 4 },
});
