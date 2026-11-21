import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
// [ADDED 2026-11-12] 행성 꾸미기 팝업: 산 특수 효과를 원하는 일기 행성에 적용·변경·해제한다. 상점 팝업과 같은 모양.
//  - 상점에서 열기(방법 A): 효과를 고른 채로 열림 → 내 일기(행성) 목록에서 행성 고르기 → 미리보기 → 적용
//  - 행성 상세에서 열기(방법 B): 그 행성으로 바로 열림 → 효과 고르기 → 미리보기 → 적용/변경/해제
//  - 효과는 소모품: 1개 = 행성 1개. 남은 개수가 없으면 미리보기만 되고 버튼이 '구매'로 바뀐다.
//    해제하거나 다른 효과로 바꾸면 그 1개는 다시 남은 개수로 돌아온다. 적용·해제 권한과 개수는 서버가 다시 확인한다.
//  - 행성 본체(감정 색·무늬·크기·위치)는 바뀌지 않는다. 효과는 바깥에만 더해진다.
// [MODIFIED 2026-11-21] 두 카테고리: '표면'(Surface Style, 행성 표면 재질) · '효과'(Special Effect, 행성 주변).
//  - 행성 하나에 표면 하나 + 효과 하나를 따로 고른다. 미리보기에는 둘 다 함께 보인다.
//  - 구매·남은 개수·적용·해제 규칙은 두 카테고리가 같다(서버 표만 따로: planet_surfaces / planet_effects).
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { PlanetPreview } from '@/components/universe-scene';
import { showMessage } from '@/lib/feedback';
import { confirmChoice } from '@/lib/notice';
import { PLANET_BASE_RADIUS, planetScaleForText } from '@/lib/planet-visual';
import type { ShopItem } from '@/lib/shop-api';
import { EFFECT_LABELS, SPECIAL_TYPES, effectOfItem, type SpecialType } from '@/lib/special-planet';
import { SURFACE_STYLES, SURFACE_STYLE_IDS, surfaceOfItem, type SurfaceStyle } from '@/lib/surface-style';
import { useDiary, type DiaryEntry } from '@/store/diary-context';
import { useShop } from '@/store/shop-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 방법 B: 이 행성으로 바로 연다 */
  diaryId?: string | null;
  /** 방법 A: 이 효과를 고른 채로 연다(행성 고르기부터) */
  effect?: SpecialType | null;
  /** [2026-11-21] 방법 A: 이 표면을 고른 채로 연다(행성 고르기부터, '표면' 카테고리) */
  surface?: SurfaceStyle | null;
};

type Category = 'surface' | 'effect';

/** 카테고리별 차이(종류 목록·아이템 판별·현재 값·문구)만 모아 둔다. 나머지 흐름은 같다. */
type Kind<T extends string> = {
  category: Category;
  types: readonly T[];
  ofItem: (item: ShopItem) => T | null;
  current: (e: DiaryEntry) => T | null;
  fallbackName: (t: T) => string;
  fallbackIcon: (t: T) => string;
  noun: string;
  noneLabel: string;
  noneStatus: string;
  hint: string;
};

const EFFECT_KIND: Kind<SpecialType> = {
  category: 'effect',
  types: SPECIAL_TYPES,
  ofItem: effectOfItem,
  current: (e) => e.effect,
  fallbackName: (t) => EFFECT_LABELS[t].name,
  fallbackIcon: (t) => EFFECT_LABELS[t].icon,
  noun: '효과',
  noneLabel: '효과 없음',
  noneStatus: '기본 행성',
  hint: '효과 1개로 행성 1개를 꾸밀 수 있어요. 해제하거나 다른 효과로 바꾸면 그 1개는 다시 쓸 수 있어요. 행성의 색과 무늬는 그대로예요.',
};

const SURFACE_KIND: Kind<SurfaceStyle> = {
  category: 'surface',
  types: SURFACE_STYLE_IDS,
  ofItem: surfaceOfItem,
  current: (e) => e.surface,
  fallbackName: (t) => SURFACE_STYLES[t].name,
  fallbackIcon: (t) => SURFACE_STYLES[t].icon,
  noun: '표면',
  noneLabel: '기본 표면',
  noneStatus: '기본',
  hint: '표면 1개로 행성 1개를 꾸밀 수 있어요. 감정으로 정해진 색·무늬·크기는 그대로이고, 표면 재질(광택·빛결)만 바뀌어요.',
};

export function dateLabel(createdAt: number) {
  const d = new Date(createdAt);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function PlanetDecorator({ visible, onClose, diaryId = null, effect = null, surface = null }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* 열 때마다 처음 상태(고른 행성·효과·표면)로 시작하도록 key 로 새로 만든다 */}
      {visible ? (
        <DecoratorSheet key={`${diaryId}-${effect}-${surface}`} onClose={onClose} diaryId={diaryId} effect={effect} surface={surface} />
      ) : null}
    </Modal>
  );
}

/** 카테고리 하나의 상태: 종류 → 상점 아이템, 남은 개수, 고른 값 */
function useKindState<T extends string>(kind: Kind<T>, entry: DiaryEntry | undefined, initial: T | null) {
  const { entries } = useDiary();
  const { items } = useShop();
  // 고른 값(미리보기). undefined = 아직 안 고름 → 행성의 현재 값
  const [chosen, setChosen] = useState<T | null | undefined>(initial ?? undefined);
  // 종류 → 상점 아이템(이름·아이콘·가격·보유). 서버에 없는 종류는 고를 수 없다.
  const itemByType = useMemo(() => {
    const map = new Map<T, ShopItem>();
    for (const item of items) {
      const type = kind.ofItem(item);
      if (type && !map.has(type)) map.set(type, item);
    }
    return map;
  }, [items, kind]);
  const types = kind.types.filter((t) => itemByType.has(t));
  const current = entry ? kind.current(entry) : null;
  const selected = chosen === undefined ? current : chosen;
  // 남은 개수 = 산 개수 − 지금 적용 중인 행성 수(내 행성 목록 기준, 적용·해제 즉시 반영)
  const inUse = (t: T) => entries.filter((e) => kind.current(e) === t).length;
  const quantity = (t: T) => itemByType.get(t)?.quantity ?? 0;
  const left = (t: T) => Math.max(quantity(t) - inUse(t), 0);
  // 이 행성에 적용할 수 있는지: 이미 이 행성에 있거나 남은 개수가 있을 때
  const canApply = (t: T) => t === current || left(t) > 0;
  const name = (t: T) => itemByType.get(t)?.name ?? kind.fallbackName(t);
  const icon = (t: T) => itemByType.get(t)?.icon ?? kind.fallbackIcon(t);
  return { kind, itemByType, types, current, selected, setChosen, quantity, left, canApply, name, icon };
}

type KindState<T extends string> = ReturnType<typeof useKindState<T>>;

function DecoratorSheet({ onClose, diaryId, effect, surface }: Omit<Props, 'visible'>) {
  const { width, height } = useWindowDimensions();
  const { entries } = useDiary();
  const { coins, error, refresh, purchase, applyPlanetEffect, applyPlanetSurface } = useShop();
  const [pickedId, setPickedId] = useState<string | null>(diaryId ?? null);
  const entry = pickedId ? entries.find((e) => e.id === pickedId) : undefined;
  const [category, setCategory] = useState<Category>(surface ? 'surface' : 'effect');
  const fx = useKindState(EFFECT_KIND, entry, effect ?? null);
  const sf = useKindState(SURFACE_KIND, entry, surface ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sheetWidth = Math.min(width - 24, 496);
  const sheetHeight = Math.min(height * 0.84, 740);

  const run = async (task: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    setNotice(null);
    const result = await task();
    setBusy(false);
    if (result.ok) setNotice(done);
    else showMessage('실패', result.error);
  };

  const buy = (item: ShopItem) => {
    if (busy) return;
    confirmChoice('구매', `${item.icon} ${item.name}을(를) 🪙 ${item.price}에 살까요?\n1개로 행성 1개를 꾸밀 수 있어요.`, '구매', () =>
      run(() => purchase(item.id), `${item.icon} ${item.name} 1개를 샀어요. 이제 이 행성에 적용할 수 있어요.`)
    );
  };

  const sorted = useMemo(() => [...entries].sort((a, b) => b.createdAt - a.createdAt), [entries]);
  const listTarget = surface
    ? { icon: sf.icon(surface), name: sf.name(surface) }
    : effect
      ? { icon: fx.icon(effect), name: fx.name(effect) }
      : null;

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="행성 꾸미기 닫기" />
      <View testID="decorator-sheet" style={[styles.sheet, { width: sheetWidth, height: sheetHeight }]}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {entry && !diaryId ? (
              <TouchableOpacity
                testID="decorator-back"
                onPress={() => {
                  setPickedId(null);
                  setNotice(null);
                  fx.setChosen(effect ?? undefined);
                  sf.setChosen(surface ?? undefined);
                }}
                hitSlop={10}>
                <Text style={styles.backText}>‹ 행성 목록</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.title}>🪐 행성 꾸미기</Text>
          <View style={[styles.headerSide, styles.headerRight]}>
            <View style={styles.coinPill}>
              <Text style={styles.coinText}>🪙 {coins ?? '…'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="닫기" testID="decorator-close" hitSlop={10} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <TouchableOpacity style={styles.errorBox} onPress={refresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>눌러서 다시 시도</Text>
          </TouchableOpacity>
        ) : null}

        {!entry ? (
          <PlanetList entries={sorted} target={listTarget} fx={fx} sf={sf} onPick={(id) => setPickedId(id)} />
        ) : (
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.preview} testID="decorator-preview">
              <PlanetPreview
                id={entry.id}
                visual={entry.planet}
                radius={PLANET_BASE_RADIUS * planetScaleForText(entry.text)}
                effect={fx.selected}
                surface={sf.selected}
              />
              <Text style={styles.previewTag} pointerEvents="none">
                미리보기
              </Text>
              <Text style={styles.previewDate} pointerEvents="none">
                {dateLabel(entry.createdAt)}의 행성
              </Text>
            </View>
            <Text style={styles.snippet} numberOfLines={2}>
              {entry.text}
            </Text>
            <Text style={styles.currentLine} testID="decorator-current">
              현재 표면:{' '}
              <Text style={styles.currentValue}>{sf.current ? `${sf.icon(sf.current)} ${sf.name(sf.current)}` : '기본 표면'}</Text>
              {'  ·  '}효과:{' '}
              <Text style={styles.currentValue}>{fx.current ? `${fx.icon(fx.current)} ${fx.name(fx.current)}` : '없음'}</Text>
            </Text>

            <View style={styles.divider} />
            <View style={styles.categoryRow}>
              {(['surface', 'effect'] as const).map((c) => (
                <TouchableOpacity
                  key={c}
                  testID={`decorator-category-${c}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: category === c }}
                  onPress={() => {
                    setCategory(c);
                    setNotice(null);
                  }}
                  style={[styles.category, category === c && styles.categoryActive]}>
                  <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>
                    {c === 'surface' ? '표면 (행성 표면)' : '효과 (행성 주변)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {category === 'surface' ? (
              <KindPanel
                state={sf}
                coins={coins}
                busy={busy}
                notice={notice}
                onBuy={buy}
                onApply={(t) => {
                  if (busy) return;
                  const item = t ? sf.itemByType.get(t) : undefined;
                  run(
                    () => applyPlanetSurface(entry.id, item?.id ?? null),
                    t ? `${sf.icon(t)} ${sf.name(t)}을(를) 적용했어요.` : '표면을 해제했어요. 기본 표면으로 돌아갔어요.'
                  );
                }}
              />
            ) : (
              <KindPanel
                state={fx}
                coins={coins}
                busy={busy}
                notice={notice}
                onBuy={buy}
                onApply={(t) => {
                  if (busy) return;
                  const item = t ? fx.itemByType.get(t) : undefined;
                  run(
                    () => applyPlanetEffect(entry.id, item?.id ?? null),
                    t ? `${fx.icon(t)} ${fx.name(t)}를 적용했어요.` : '효과를 해제했어요. 기본 행성으로 돌아갔어요.'
                  );
                }}
              />
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** 한 카테고리(표면 또는 효과)의 고르기 줄 + 안내 + 큰 버튼 */
function KindPanel<T extends string>({
  state,
  coins,
  busy,
  notice,
  onApply,
  onBuy,
}: {
  state: KindState<T>;
  coins: number | null;
  busy: boolean;
  notice: string | null;
  onApply: (t: T | null) => void;
  onBuy: (item: ShopItem) => void;
}) {
  const { kind, types, current, selected, setChosen, quantity, left, canApply, name, icon, itemByType } = state;
  const { error } = useShop();
  const selectedItem = selected ? itemByType.get(selected) : undefined;

  // 아래 큰 버튼 하나: 고른 값·현재 값·보유 여부에 따라 바뀐다
  let primary: { label: string; disabled: boolean; ghost?: boolean; onPress: () => void };
  if (selected && !canApply(selected)) {
    const price = selectedItem?.price ?? 0;
    const enough = (coins ?? 0) >= price;
    primary =
      selectedItem?.on_sale === false
        ? { label: `판매 종료된 ${kind.noun}이에요`, disabled: true, onPress: () => {} }
        : {
            label: enough ? `🪙 ${price}에 구매하기` : '코인 부족',
            disabled: !enough,
            onPress: () => {
              if (selectedItem) onBuy(selectedItem);
            },
          };
  } else if (selected === current) {
    primary = { label: current ? '적용 중' : `${kind.noneLabel} 사용 중`, disabled: true, onPress: () => {} };
  } else if (!selected) {
    primary = { label: `${kind.noun} 해제`, disabled: false, ghost: true, onPress: () => onApply(null) };
  } else {
    primary = { label: current ? `이 ${kind.noun}으로 변경하기` : '적용하기', disabled: false, onPress: () => onApply(selected) };
  }

  return (
    <View testID={`decorator-panel-${kind.category}`}>
      {types.length === 0 && !error ? <Text style={styles.empty}>상점에 행성 {kind.noun}이 아직 없어요.</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <EffectChip
          testID={`decorator-${kind.category}-none`}
          icon="🪐"
          name={kind.noneLabel}
          status={current === null ? '사용 중' : kind.noneStatus}
          selected={selected === null}
          onPress={() => setChosen(null)}
        />
        {types.map((t) => {
          const item = itemByType.get(t);
          return (
            <EffectChip
              key={t}
              testID={`decorator-${kind.category}-${t}`}
              icon={icon(t)}
              name={name(t)}
              status={
                current === t
                  ? '적용 중'
                  : left(t) > 0
                    ? `남은 ${left(t)}개`
                    : quantity(t) > 0
                      ? '모두 사용 중'
                      : `🔒 🪙 ${item?.price ?? ''}`
              }
              locked={!canApply(t)}
              selected={selected === t}
              onPress={() => setChosen(t)}
            />
          );
        })}
      </ScrollView>
      {selected && !canApply(selected) ? (
        <Text style={styles.hint} testID="decorator-hint">
          {quantity(selected) > 0
            ? `가진 ${name(selected)} ${quantity(selected)}개를 모두 다른 행성에 쓰고 있어요. 하나 더 사면 이 행성에도 적용할 수 있어요.`
            : `아직 가지고 있지 않은 ${kind.noun}이에요. 미리보기만 할 수 있어요.`}
        </Text>
      ) : (
        <Text style={styles.hint} testID="decorator-hint">
          {kind.hint}
        </Text>
      )}

      <TouchableOpacity
        testID="decorator-primary"
        accessibilityLabel={primary.label}
        disabled={primary.disabled || busy}
        onPress={primary.onPress}
        style={[styles.button, primary.ghost && styles.buttonGhost, primary.disabled && styles.buttonDisabled]}>
        {busy ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text style={[styles.buttonText, primary.disabled && styles.buttonTextDisabled]}>{primary.label}</Text>
        )}
      </TouchableOpacity>
      {current && selected !== null && !busy ? (
        <TouchableOpacity testID="decorator-remove" onPress={() => onApply(null)} style={styles.removeLink} hitSlop={8}>
          <Text style={styles.removeText}>{kind.noun} 해제</Text>
        </TouchableOpacity>
      ) : null}
      {notice ? (
        <Text style={styles.notice} testID="decorator-notice">
          ✓ {notice}
        </Text>
      ) : null}
    </View>
  );
}

function PlanetList({
  entries,
  target,
  fx,
  sf,
  onPick,
}: {
  entries: DiaryEntry[];
  target: { icon: string; name: string } | null;
  fx: KindState<SpecialType>;
  sf: KindState<SurfaceStyle>;
  onPick: (id: string) => void;
}) {
  return (
    <ScrollView style={styles.body} showsVerticalScrollIndicator={false} testID="decorator-list">
      <Text style={styles.sectionTitle}>
        {target ? `${target.icon} ${target.name}을(를) 적용할 행성을 골라 주세요` : '꾸밀 행성을 골라 주세요'}
      </Text>
      {entries.length === 0 ? <Text style={styles.empty}>아직 일기가 없어요. 일기를 쓰면 행성이 생겨요.</Text> : null}
      {entries.map((e) => {
        const parts = [
          e.surface ? `${sf.icon(e.surface)} ${SURFACE_STYLES[e.surface].name}` : '',
          e.effect ? `${fx.icon(e.effect)} ${EFFECT_LABELS[e.effect].name.replace(' 효과', '')}` : '',
        ].filter(Boolean);
        return (
          <TouchableOpacity
            key={e.id}
            testID={`decorator-planet-${e.id}`}
            style={styles.planetRow}
            onPress={() => onPick(e.id)}
            accessibilityLabel={`${dateLabel(e.createdAt)} 행성 고르기`}>
            <View style={[styles.dot, { backgroundColor: e.color }]} />
            <View style={styles.planetRowText}>
              <Text style={styles.planetDate}>{dateLabel(e.createdAt)}</Text>
              <Text style={styles.planetSnippet} numberOfLines={1}>
                {e.text}
              </Text>
            </View>
            <Text style={[styles.planetEffect, parts.length > 0 && styles.planetEffectOn]} numberOfLines={2}>
              {parts.length ? parts.join('\n') : '기본'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function EffectChip({
  icon,
  name,
  status,
  selected,
  locked,
  onPress,
  testID,
}: {
  icon: string;
  name: string;
  status: string;
  selected: boolean;
  locked?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityLabel={`${name} 미리보기`}
      onPress={onPress}
      style={[styles.chip, locked && styles.chipLocked, selected && styles.chipSelected]}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.chipStatus} numberOfLines={1}>
        {status}
      </Text>
    </TouchableOpacity>
  );
}

// 색·모양은 상점 팝업(shop-screen.tsx)과 같게 맞춘다
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: '#000',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3A3A4A',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerSide: { width: 110 },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  backText: { color: '#c8c8d8', fontSize: 14, fontWeight: '600' },
  coinPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  coinText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  errorBox: { backgroundColor: '#3A1F2E', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#F66C9E', fontSize: 13 },
  errorRetry: { color: '#fff', fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  body: { flex: 1 },
  preview: {
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#05050c',
    borderWidth: 1,
    borderColor: '#2f2f3d',
  },
  previewTag: {
    position: 'absolute',
    top: 8,
    left: 10,
    color: '#B888FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  previewDate: { position: 'absolute', bottom: 8, left: 10, color: '#c8c8d8', fontSize: 12 },
  snippet: { color: '#9C9CC0', fontSize: 12, lineHeight: 17, marginTop: 10 },
  currentLine: { color: '#c8c8d8', fontSize: 13, marginTop: 8 },
  currentValue: { color: '#FED240', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#3A3A4A', marginVertical: 14 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 10 },
  empty: { color: '#9C9CC0', fontSize: 12, marginBottom: 6, marginTop: 4 },
  row: { gap: 8, paddingRight: 4 },
  chip: {
    width: 88,
    backgroundColor: '#b2bec3',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipLocked: { backgroundColor: '#8e999e' },
  chipSelected: { borderColor: '#FED240' },
  chipIcon: { fontSize: 26, marginBottom: 4 },
  chipName: { fontSize: 12, fontWeight: 'bold', color: '#000' },
  chipStatus: { fontSize: 10, color: '#2d3436', marginTop: 2 },
  hint: { color: '#9C9CC0', fontSize: 11, lineHeight: 16, marginTop: 10, marginBottom: 12 },
  button: {
    backgroundColor: '#FED240',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  buttonGhost: { backgroundColor: '#dfe6e9' },
  buttonDisabled: { backgroundColor: '#95a5a6' },
  buttonText: { fontWeight: 'bold', fontSize: 14, color: '#000' },
  buttonTextDisabled: { color: '#555' },
  removeLink: { alignSelf: 'center', marginTop: 12, paddingHorizontal: 12, paddingVertical: 4 },
  removeText: { color: '#F66C9E', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  notice: { color: '#7CE0B0', fontSize: 13, textAlign: 'center', marginTop: 12, marginBottom: 8 },
  // [2026-11-21] 표면 / 효과 카테고리 탭
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  category: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A4A', alignItems: 'center' },
  categoryActive: { backgroundColor: '#FED240', borderColor: '#FED240' },
  categoryText: { color: '#c8c8d8', fontSize: 13, fontWeight: 'bold' },
  categoryTextActive: { color: '#000' },
  planetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1d1d26',
    borderWidth: 1,
    borderColor: '#2f2f3d',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dot: { width: 28, height: 28, borderRadius: 14 },
  planetRowText: { flex: 1 },
  planetDate: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  planetSnippet: { color: '#9C9CC0', fontSize: 12, marginTop: 2 },
  planetEffect: { color: '#6E6E90', fontSize: 12 },
  planetEffectOn: { color: '#FED240', fontWeight: 'bold' },
});
