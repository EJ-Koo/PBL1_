import { CoinIcon } from '@/components/coin-icon';
import { Text } from '@/components/app-text';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShopFrame, ShopSectionRule } from '@/components/ui/shop-frame';
import { DesignFonts } from '@/constants/ui-design';
// [ADDED 2026-11-12] 행성 꾸미기 팝업: 산 특수 효과를 원하는 일기 행성에 적용·변경·해제한다. 상점 팝업과 같은 모양.
//  - 상점에서 열기(방법 A): 효과를 고른 채로 열림 → 내 일기(행성) 목록에서 행성 고르기 → 미리보기 → 적용
//  - 행성 상세에서 열기(방법 B): 그 행성으로 바로 열림 → 효과 고르기 → 미리보기 → 적용/변경/해제
//  - 효과는 소모품: 1개 = 행성 1개. 남은 개수가 없으면 미리보기만 되고 버튼이 '구매'로 바뀐다.
//    해제하거나 다른 효과로 바꾸면 그 1개는 다시 남은 개수로 돌아온다. 적용·해제 권한과 개수는 서버가 다시 확인한다.
//  - 행성 본체(감정 색·무늬·크기·위치)는 바뀌지 않는다. 효과는 바깥에만 더해진다.
// [MODIFIED 2026-11-21] 두 카테고리: '표면'(Surface Style, 행성 표면 재질) · '효과'(Special Effect, 행성 주변).
//  - 행성 하나에 표면 하나 + 효과 하나를 따로 고른다. 미리보기에는 둘 다 함께 보인다.
//  - 구매·남은 개수·적용·해제 규칙은 두 카테고리가 같다(서버 표만 따로: planet_surfaces / planet_effects).
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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

  const compact = width < 768;
  const stacked = compact || height < 640;
  const sheetWidth = Math.min(width - (compact ? 32 : 96), 1100);
  const sheetHeight = Math.min(height - 48, compact ? height * 0.88 : 740);
  const cardWidth = compact ? 132 : 156;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

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

  const preview = entry ? <View style={[styles.previewColumn, !stacked && styles.previewColumnWide]}>
    <View style={[styles.preview, !stacked && styles.previewWide]} testID="decorator-preview">
      <PlanetPreview
        id={entry.id}
        visual={entry.planet}
        radius={PLANET_BASE_RADIUS * planetScaleForText(entry.text)}
        effect={fx.selected}
        surface={sf.selected}
        zoom={stacked ? 0.9 : 0.7}
      />
      <Text style={styles.previewTag} pointerEvents="none">미리보기</Text>
      <Text style={styles.previewDate} pointerEvents="none">{dateLabel(entry.createdAt)}의 행성</Text>
    </View>
    <Text style={styles.snippet} numberOfLines={2}>{entry.text}</Text>
    <View style={styles.currentSettings} testID="decorator-current">
      <Text style={styles.currentHeading}>현재 적용</Text>
      <View style={styles.currentRow}>
        <Text style={styles.currentLabel}>표면</Text>
        <Text style={styles.currentValue}>{sf.current ? `${sf.icon(sf.current)} ${sf.name(sf.current)}` : '기본 표면'}</Text>
      </View>
      <View style={styles.currentRow}>
        <Text style={styles.currentLabel}>효과</Text>
        <Text style={styles.currentValue}>{fx.current ? `${fx.icon(fx.current)} ${fx.name(fx.current)}` : '없음'}</Text>
      </View>
    </View>
  </View> : null;

  const controls = entry ? <View style={styles.controlsContent}>
    <View style={styles.categoryRow}>
      {(['surface', 'effect'] as const).map(c => <TouchableOpacity
        key={c} testID={`decorator-category-${c}`} accessibilityRole="tab" aria-selected={category === c}
        onPress={() => { setCategory(c); setNotice(null); }} style={styles.category}>
        <ShopFrame tab cut={12} fill={category === c ? '#D9D9D9' : '#55565A'} />
        <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>
          {c === 'surface' ? '행성 표면' : '행성 효과'}
        </Text>
      </TouchableOpacity>)}
    </View>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{category === 'surface' ? '표면 스타일' : '행성 주변 효과'}</Text>
      <ShopSectionRule />
    </View>
    {category === 'surface' ? <KindPanel
      key="surface" state={sf} coins={coins} busy={busy} notice={notice} cardWidth={cardWidth} onBuy={buy}
      onApply={type => {
        if (busy) return;
        const item = type ? sf.itemByType.get(type) : undefined;
        run(() => applyPlanetSurface(entry.id, item?.id ?? null),
          type ? `${sf.icon(type)} ${sf.name(type)}을(를) 적용했어요.` : '표면을 해제했어요. 기본 표면으로 돌아갔어요.');
      }}
    /> : <KindPanel
      key="effect" state={fx} coins={coins} busy={busy} notice={notice} cardWidth={cardWidth} onBuy={buy}
      onApply={type => {
        if (busy) return;
        const item = type ? fx.itemByType.get(type) : undefined;
        run(() => applyPlanetEffect(entry.id, item?.id ?? null),
          type ? `${fx.icon(type)} ${fx.name(type)}를 적용했어요.` : '효과를 해제했어요. 기본 행성으로 돌아갔어요.');
      }}
    />}
  </View> : null;

  return (
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="행성 꾸미기 닫기" />
      <View testID="decorator-sheet" role="dialog" aria-modal accessibilityLabel="행성 꾸미기"
        style={[styles.sheet, compact && styles.sheetCompact, { width: sheetWidth, height: sheetHeight }]}>
        <ShopFrame fill="#1F2025" cut={compact ? 22 : 32} />
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}
              numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>PLANET STUDIO</Text>
            <Text style={styles.subtitle}>행성 꾸미기</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.coinBalance} accessibilityLabel={`보유 코인 ${coins ?? '확인 중'}`}>
              <CoinIcon size={18} /><Text style={styles.coinText}>{coins?.toLocaleString() ?? '…'}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} accessibilityLabel="행성 꾸미기 닫기" testID="decorator-close" style={styles.close}>
              <Svg width={18} height={18} viewBox="0 0 24 24" pointerEvents="none" aria-hidden>
                <Path d="M5 5L19 19 M19 5L5 19" stroke="#D9D9D9" strokeWidth={1.8} />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>

        {entry && !diaryId ? <TouchableOpacity accessibilityRole="button" testID="decorator-back" style={styles.backLink}
          onPress={() => {
            setPickedId(null); setNotice(null);
            fx.setChosen(effect ?? undefined); sf.setChosen(surface ?? undefined);
          }}><Text style={styles.backText}>‹ 행성 목록</Text></TouchableOpacity> : null}

        {error ? (
          <TouchableOpacity accessibilityRole="button" style={styles.errorBox} onPress={refresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>눌러서 다시 시도</Text>
          </TouchableOpacity>
        ) : null}

        {!entry ? (
          <PlanetList entries={sorted} target={listTarget} fx={fx} sf={sf} onPick={(id) => setPickedId(id)} />
        ) : stacked ? <ScrollArea style={styles.body} contentContainerStyle={styles.mobileContent}
          label="행성 꾸미기 옵션" scrollbarLabel="행성 꾸미기 세로 스크롤" testID="decorator-scroll">
          {preview}{controls}
        </ScrollArea> : <View style={styles.workbench}>
          {preview}
          <ScrollArea style={styles.body} contentContainerStyle={styles.controlsScrollContent}
            label="행성 꾸미기 옵션" scrollbarLabel="행성 꾸미기 세로 스크롤" testID="decorator-scroll">
            {controls}
          </ScrollArea>
        </View>}
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
  cardWidth,
  onApply,
  onBuy,
}: {
  state: KindState<T>;
  coins: number | null;
  busy: boolean;
  notice: string | null;
  cardWidth: number;
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
            label: enough ? `${price}코인에 구매하기` : '코인 부족',
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
    primary = { label: current ? `이 ${kind.noun}${kind.category === 'surface' ? '으로' : '로'} 변경하기` : '적용하기', disabled: false, onPress: () => onApply(selected) };
  }

  return (
    <View testID={`decorator-panel-${kind.category}`}>
      {types.length === 0 && !error ? <Text style={styles.empty}>상점에 행성 {kind.noun}이 아직 없어요.</Text> : null}
      <ScrollArea horizontal hideScrollbarWhenNotScrollable contentContainerStyle={styles.row} scrollStep={cardWidth + 12}
        label={`행성 ${kind.noun} 목록`} scrollbarLabel={`행성 ${kind.noun} 가로 스크롤`} testID={`decorator-${kind.category}-scroll`}>
        <EffectChip
          testID={`decorator-${kind.category}-none`}
          width={cardWidth}
          icon={null}
          name={kind.noneLabel}
          status={current === null ? '사용 중' : kind.noneStatus}
          selected={selected === null}
          disabled={busy}
          onPress={() => setChosen(null)}
        />
        {types.map((t) => {
          const item = itemByType.get(t);
          return (
            <EffectChip
              key={t}
              testID={`decorator-${kind.category}-${t}`}
              width={cardWidth}
              icon={icon(t)}
              name={name(t)}
              status={
                current === t
                  ? '적용 중'
                  : left(t) > 0
                    ? `남은 ${left(t)}개`
                    : quantity(t) > 0
                      ? '모두 사용 중'
                      : '구매 필요'
              }
              price={current !== t && quantity(t) === 0 ? item?.price : undefined}
              locked={!canApply(t)}
              selected={selected === t}
              disabled={busy}
              onPress={() => setChosen(t)}
            />
          );
        })}
      </ScrollArea>
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
        accessibilityRole="button"
        accessibilityLabel={primary.label}
        aria-busy={busy}
        disabled={primary.disabled || busy}
        onPress={primary.onPress}
        style={[styles.button, primary.ghost && styles.buttonGhost, primary.disabled && styles.buttonDisabled]}>
        {busy ? (
          <ActivityIndicator size="small" color={primary.ghost ? '#fff' : '#000'} />
        ) : (
          <Text style={[styles.buttonText, primary.ghost && styles.buttonTextLight, primary.disabled && styles.buttonTextDisabled]}>{primary.label}</Text>
        )}
      </TouchableOpacity>
      {current && selected !== null && !busy ? (
        <TouchableOpacity accessibilityRole="button" testID="decorator-remove" onPress={() => onApply(null)} style={styles.removeLink}>
          <Text style={styles.removeText}>{kind.noun} 해제</Text>
        </TouchableOpacity>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice} testID="decorator-notice">
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
    <ScrollArea style={styles.body} contentContainerStyle={styles.listContent}
      label="꾸밀 행성 목록" scrollbarLabel="행성 목록 세로 스크롤" testID="decorator-list">
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
            accessibilityRole="button"
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
            <Svg width={12} height={18} viewBox="0 0 12 18" pointerEvents="none" aria-hidden>
              <Path d="M3 3l6 6-6 6" fill="none" stroke="#D9D9D9" strokeWidth={1.2} />
            </Svg>
          </TouchableOpacity>
        );
      })}
    </ScrollArea>
  );
}

function EffectChip({
  icon,
  name,
  status,
  price,
  width,
  selected,
  locked,
  disabled,
  onPress,
  testID,
}: {
  icon: string | null;
  name: string;
  status: string;
  price?: number;
  width: number;
  selected: boolean;
  locked?: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name} 미리보기`}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, { width }, selected && styles.chipSelected, disabled && styles.chipDisabled]}>
      <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
        {[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, index) =>
          <View key={index} style={[styles.cardCorner, corner, selected && styles.cardCornerSelected]} />)}
      </View>
      <Text style={[styles.chipBadge, selected && styles.chipBadgeSelected]}>{selected ? '미리보기' : locked && price !== undefined ? '미보유' : ''}</Text>
      <View style={styles.chipArtwork}>
        {icon ? <Text style={styles.chipIcon}>{icon}</Text> : <Svg width={48} height={48} viewBox="0 0 48 48" pointerEvents="none" aria-hidden>
          <Circle cx={24} cy={24} r={13} fill="none" stroke="#D9D9D9" strokeWidth={1.2} />
          <Path d="M10 22C-2 33 13 39 29 31S52 13 37 17" fill="none" stroke="#D9D9D9" strokeWidth={1.2} />
        </Svg>}
      </View>
      <Text style={styles.chipName} numberOfLines={2}>
        {name}
      </Text>
      <View style={styles.chipStatusRow}>
        {price !== undefined ? <><CoinIcon size={15} /><Text style={styles.chipPrice}>{price}</Text></>
          : <Text style={styles.chipStatus}>{status}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// Match SPACE SHOP: charcoal panels, cut corners, white actions and violet previews.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  sheet: { paddingTop: 28, paddingHorizontal: 40, paddingBottom: 32 },
  sheetCompact: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16, marginBottom: 22, borderBottomWidth: 1, borderBottomColor: '#747478' },
  heading: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontFamily: DesignFonts.bold, fontSize: 28, lineHeight: 36 },
  titleCompact: { fontSize: 20, lineHeight: 28 },
  subtitle: { color: '#ADADB2', fontSize: 12, lineHeight: 18, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinBalance: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinText: { color: '#fff', fontSize: 13, fontFamily: DesignFonts.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  backLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: -14, marginBottom: 8 },
  backText: { color: '#D9D9D9', fontSize: 13, lineHeight: 20 },
  errorBox: { backgroundColor: '#30232D', borderWidth: 1, borderColor: '#F66C9E66', padding: 12, marginBottom: 16 },
  errorText: { color: '#F66C9E', fontSize: 13, lineHeight: 20 },
  errorRetry: { color: '#fff', fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  body: { flex: 1, minHeight: 0, minWidth: 0 },
  workbench: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 28 },
  mobileContent: { paddingRight: 6, paddingBottom: 8, gap: 24 },
  controlsScrollContent: { paddingRight: 8, paddingBottom: 8 },
  previewColumn: { minWidth: 0 },
  previewColumnWide: { width: '35%', flexShrink: 0 },
  preview: { height: 240, overflow: 'hidden', backgroundColor: '#17181D', borderWidth: 1, borderColor: '#747478' },
  previewWide: { flex: 1, minHeight: 260 },
  previewTag: { position: 'absolute', top: 12, left: 14, color: '#D9D9D9', fontSize: 11, lineHeight: 18 },
  previewDate: { position: 'absolute', bottom: 12, left: 14, right: 14, color: '#fff', fontSize: 12, lineHeight: 20 },
  snippet: { color: '#ADADB2', fontSize: 12, lineHeight: 19, marginTop: 12 },
  currentSettings: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#747478', gap: 8 },
  currentHeading: { color: '#ADADB2', fontSize: 11, lineHeight: 18 },
  currentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  currentLabel: { color: '#ADADB2', fontSize: 12, lineHeight: 20 },
  currentValue: { flex: 1, color: '#D9D9D9', fontSize: 12, lineHeight: 20 },
  controlsContent: { minWidth: 0 },
  categoryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  category: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  categoryText: { color: '#fff', fontSize: 14, lineHeight: 22 },
  categoryTextActive: { color: '#000' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontSize: 15, lineHeight: 24 },
  empty: { color: '#ADADB2', fontSize: 12, lineHeight: 20, marginBottom: 12, marginTop: 4 },
  row: { gap: 12, padding: 2, alignItems: 'stretch' },
  chip: { flexShrink: 0, minHeight: 186, backgroundColor: '#1F2025', borderWidth: 1, borderColor: '#747478', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 14, alignItems: 'center' },
  chipSelected: { borderColor: '#B888FF', backgroundColor: '#29252F' },
  chipDisabled: { opacity: 0.5 },
  cardCorner: { position: 'absolute', width: 12, height: 12, borderColor: '#D9D9D9' },
  cardCornerSelected: { borderColor: '#B888FF' },
  topLeft: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3 },
  chipBadge: { alignSelf: 'stretch', minHeight: 18, color: '#ADADB2', fontSize: 9, lineHeight: 15, textAlign: 'right' },
  chipBadgeSelected: { color: '#B888FF' },
  chipArtwork: { height: 64, alignItems: 'center', justifyContent: 'center' },
  chipIcon: { fontSize: 40, lineHeight: 54 },
  chipName: { alignSelf: 'stretch', minHeight: 42, fontSize: 14, lineHeight: 21, color: '#fff', textAlign: 'center' },
  chipStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 22, marginTop: 'auto' },
  chipPrice: { color: '#fff', fontSize: 12, lineHeight: 18 },
  chipStatus: { color: '#ADADB2', fontSize: 11, lineHeight: 18, textAlign: 'center' },
  hint: { color: '#ADADB2', fontSize: 12, lineHeight: 20, marginTop: 14, marginBottom: 20 },
  button: { backgroundColor: '#D9D9D9', borderWidth: 1, borderColor: '#D9D9D9', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDisabled: { backgroundColor: '#292A30', borderColor: '#515157' },
  buttonText: { fontFamily: DesignFonts.bold, fontSize: 14, lineHeight: 22, color: '#17181D', textAlign: 'center' },
  buttonTextLight: { color: '#D9D9D9' },
  buttonTextDisabled: { color: '#9D9DA4' },
  removeLink: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  removeText: { color: '#C4C4CA', fontSize: 12, lineHeight: 20, textDecorationLine: 'underline' },
  notice: { color: '#D9D9D9', fontSize: 12, lineHeight: 20, textAlign: 'center', marginTop: 12, padding: 12, borderWidth: 1, borderColor: '#B888FF66', backgroundColor: '#B888FF0D' },
  listContent: { paddingRight: 8, paddingBottom: 8 },
  planetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#17181D', borderWidth: 1, borderColor: '#747478', paddingVertical: 16, paddingHorizontal: 14, marginTop: 12 },
  dot: { width: 28, height: 28, borderRadius: 14 },
  planetRowText: { flex: 1, minWidth: 0 },
  planetDate: { color: '#fff', fontSize: 13, lineHeight: 20, fontFamily: DesignFonts.bold },
  planetSnippet: { color: '#ADADB2', fontSize: 12, lineHeight: 19, marginTop: 4 },
  planetEffect: { maxWidth: '30%', color: '#ADADB2', fontSize: 11, lineHeight: 18, textAlign: 'right' },
  planetEffectOn: { color: '#D3B6FF' },
});
