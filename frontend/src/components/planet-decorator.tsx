import { Text } from '@/components/app-text';
// [ADDED 2026-11-12] 행성 꾸미기 팝업: 산 특수 효과를 원하는 일기 행성에 적용·변경·해제한다. 상점 팝업과 같은 모양.
//  - 상점에서 열기(방법 A): 효과를 고른 채로 열림 → 내 일기(행성) 목록에서 행성 고르기 → 미리보기 → 적용
//  - 행성 상세에서 열기(방법 B): 그 행성으로 바로 열림 → 효과 고르기 → 미리보기 → 적용/변경/해제
//  - 효과는 소모품: 1개 = 행성 1개. 남은 개수가 없으면 미리보기만 되고 버튼이 '구매'로 바뀐다.
//    해제하거나 다른 효과로 바꾸면 그 1개는 다시 남은 개수로 돌아온다. 적용·해제 권한과 개수는 서버가 다시 확인한다.
//  - 행성 본체(감정 색·무늬·크기·위치)는 바뀌지 않는다. 효과는 바깥에만 더해진다.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';

import { PlanetPreview } from '@/components/universe-scene';
import { showMessage } from '@/lib/feedback';
import { confirmChoice } from '@/lib/notice';
import { PLANET_BASE_RADIUS, planetScaleForText } from '@/lib/planet-visual';
import type { ShopItem } from '@/lib/shop-api';
import { EFFECT_LABELS, SPECIAL_TYPES, effectOfItem, type SpecialType } from '@/lib/special-planet';
import { useDiary, type DiaryEntry } from '@/store/diary-context';
import { useShop } from '@/store/shop-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 방법 B: 이 행성으로 바로 연다 */
  diaryId?: string | null;
  /** 방법 A: 이 효과를 고른 채로 연다(행성 고르기부터) */
  effect?: SpecialType | null;
};

export function dateLabel(createdAt: number) {
  const d = new Date(createdAt);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function effectName(type: SpecialType, item?: ShopItem) {
  return item?.name ?? EFFECT_LABELS[type].name;
}

function effectIcon(type: SpecialType, item?: ShopItem) {
  return item?.icon ?? EFFECT_LABELS[type].icon;
}

export function PlanetDecorator({ visible, onClose, diaryId = null, effect = null }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* 열 때마다 처음 상태(고른 행성·효과)로 시작하도록 key 로 새로 만든다 */}
      {visible ? <DecoratorSheet key={`${diaryId}-${effect}`} onClose={onClose} diaryId={diaryId} effect={effect} /> : null}
    </Modal>
  );
}

function DecoratorSheet({ onClose, diaryId, effect }: Omit<Props, 'visible'>) {
  const { width, height } = useWindowDimensions();
  const { entries } = useDiary();
  const { coins, items, error, refresh, purchase, applyPlanetEffect } = useShop();
  const [pickedId, setPickedId] = useState<string | null>(diaryId ?? null);
  const entry = pickedId ? entries.find((e) => e.id === pickedId) : undefined;
  // 고른 효과(미리보기). undefined = 아직 안 고름 → 행성의 현재 효과
  const [chosen, setChosen] = useState<SpecialType | null | undefined>(effect ?? undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 효과 종류 → 상점 아이템(이름·아이콘·가격·보유). 서버에 없는 효과는 고를 수 없다.
  const itemByType = useMemo(() => {
    const map = new Map<SpecialType, ShopItem>();
    for (const item of items) {
      const type = effectOfItem(item);
      if (type && !map.has(type)) map.set(type, item);
    }
    return map;
  }, [items]);
  const types = SPECIAL_TYPES.filter((t) => itemByType.has(t));

  const sheetWidth = Math.min(width - 24, 496);
  const sheetHeight = Math.min(height * 0.84, 740);
  const current = entry?.effect ?? null;
  const selected = chosen === undefined ? current : chosen;
  const selectedItem = selected ? itemByType.get(selected) : undefined;
  // 남은 개수 = 산 개수 − 지금 적용 중인 행성 수(내 행성 목록 기준, 적용·해제 즉시 반영)
  const inUse = (t: SpecialType) => entries.filter((e) => e.effect === t).length;
  const quantity = (t: SpecialType) => itemByType.get(t)?.quantity ?? 0;
  const left = (t: SpecialType) => Math.max(quantity(t) - inUse(t), 0);
  // 이 행성에 적용할 수 있는지: 이미 이 행성에 있거나 남은 개수가 있을 때
  const canApply = (t: SpecialType) => t === current || left(t) > 0;

  const run = async (task: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    setNotice(null);
    const result = await task();
    setBusy(false);
    if (result.ok) setNotice(done);
    else showMessage('실패', result.error);
  };

  const apply = (type: SpecialType | null) => {
    if (!entry || busy) return;
    const item = type ? itemByType.get(type) : undefined;
    run(
      () => applyPlanetEffect(entry.id, item?.id ?? null),
      type ? `${effectIcon(type, item)} ${effectName(type, item)}를 적용했어요.` : '효과를 해제했어요. 기본 행성으로 돌아갔어요.'
    );
  };

  const buy = (type: SpecialType) => {
    const item = itemByType.get(type);
    if (!item || busy) return;
    confirmChoice('구매', `${item.icon} ${item.name}을(를) 🪙 ${item.price}에 살까요?\n1개로 행성 1개를 꾸밀 수 있어요.`, '구매', () =>
      run(() => purchase(item.id), `${item.icon} ${item.name} 1개를 샀어요. 이제 이 행성에 적용할 수 있어요.`)
    );
  };

  // 아래 큰 버튼 하나: 고른 효과·현재 효과·보유 여부에 따라 바뀐다
  let primary: { label: string; disabled: boolean; ghost?: boolean; onPress: () => void };
  if (selected && !canApply(selected)) {
    const price = selectedItem?.price ?? 0;
    const enough = (coins ?? 0) >= price;
    primary = selectedItem?.on_sale === false
      ? { label: '판매 종료된 효과예요', disabled: true, onPress: () => {} }
      : { label: enough ? `🪙 ${price}에 구매하기` : '코인 부족', disabled: !enough, onPress: () => buy(selected) };
  } else if (selected === current) {
    primary = { label: current ? '적용 중' : '기본 행성 (효과 없음)', disabled: true, onPress: () => {} };
  } else if (!selected) {
    primary = { label: '효과 해제', disabled: false, ghost: true, onPress: () => apply(null) };
  } else {
    primary = { label: current ? '이 효과로 변경하기' : '적용하기', disabled: false, onPress: () => apply(selected) };
  }

  const sorted = useMemo(() => [...entries].sort((a, b) => b.createdAt - a.createdAt), [entries]);

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
                  setChosen(effect ?? undefined);
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
          <PlanetList entries={sorted} effect={effect ?? null} itemByType={itemByType} onPick={(id) => setPickedId(id)} />
        ) : (
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.preview} testID="decorator-preview">
              <PlanetPreview
                id={entry.id}
                visual={entry.planet}
                radius={PLANET_BASE_RADIUS * planetScaleForText(entry.text)}
                effect={selected}
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
              현재 효과:{' '}
              <Text style={styles.currentValue}>
                {current ? `${effectIcon(current, itemByType.get(current))} ${effectName(current, itemByType.get(current))}` : '없음 (기본 행성)'}
              </Text>
            </Text>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>효과 고르기</Text>
            {types.length === 0 && !error ? <Text style={styles.empty}>상점에 행성 효과가 아직 없어요.</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              <EffectChip
                testID="decorator-effect-none"
                icon="🪐"
                name="효과 없음"
                status={current === null ? '사용 중' : '기본 행성'}
                selected={selected === null}
                onPress={() => setChosen(null)}
              />
              {types.map((t) => {
                const item = itemByType.get(t);
                return (
                  <EffectChip
                    key={t}
                    testID={`decorator-effect-${t}`}
                    icon={effectIcon(t, item)}
                    name={effectName(t, item)}
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
                  ? `가진 ${effectName(selected, selectedItem)} ${quantity(selected)}개를 모두 다른 행성에 쓰고 있어요. 하나 더 사면 이 행성에도 적용할 수 있어요.`
                  : '아직 가지고 있지 않은 효과예요. 미리보기만 할 수 있어요.'}
              </Text>
            ) : (
              <Text style={styles.hint} testID="decorator-hint">
                효과 1개로 행성 1개를 꾸밀 수 있어요. 해제하거나 다른 효과로 바꾸면 그 1개는 다시 쓸 수 있어요. 행성의 색과 무늬는 그대로예요.
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
              <TouchableOpacity testID="decorator-remove" onPress={() => apply(null)} style={styles.removeLink} hitSlop={8}>
                <Text style={styles.removeText}>효과 해제</Text>
              </TouchableOpacity>
            ) : null}
            {notice ? (
              <Text style={styles.notice} testID="decorator-notice">
                ✓ {notice}
              </Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function PlanetList({
  entries,
  effect,
  itemByType,
  onPick,
}: {
  entries: DiaryEntry[];
  effect: SpecialType | null;
  itemByType: Map<SpecialType, ShopItem>;
  onPick: (id: string) => void;
}) {
  const item = effect ? itemByType.get(effect) : undefined;
  return (
    <ScrollView style={styles.body} showsVerticalScrollIndicator={false} testID="decorator-list">
      <Text style={styles.sectionTitle}>
        {effect ? `${effectIcon(effect, item)} ${effectName(effect, item)}를 적용할 행성을 골라 주세요` : '꾸밀 행성을 골라 주세요'}
      </Text>
      {entries.length === 0 ? <Text style={styles.empty}>아직 일기가 없어요. 일기를 쓰면 행성이 생겨요.</Text> : null}
      {entries.map((e) => (
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
          <Text style={[styles.planetEffect, e.effect && styles.planetEffectOn]}>
            {e.effect ? `${effectIcon(e.effect, itemByType.get(e.effect))} ${EFFECT_LABELS[e.effect].name.replace(' 효과', '')}` : '기본'}
          </Text>
        </TouchableOpacity>
      ))}
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
