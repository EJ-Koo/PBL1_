import { useLanguage } from '@/lib/language';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CoinIcon } from '@/components/coin-icon';
import { Text } from '@/components/app-text';
// 상점 팝업: 각진 프레임·모서리 카드 디자인 + 서버 코인·구매·장착.
//  - 화면 가운데 뜨는 창 (2026-11-10 아래 → 가운데로 변경). ✕ 버튼, 창 바깥 누르기, 안드로이드 뒤로가기로 닫힘
//  - 탭: 배경(이펙트 줄 / 테마 줄) · 음악 · 커서 · 소모품
//  - 각 줄은 가로로 넘겨 보는 카드 목록. 산 것은 장착/해제, 안 산 것은 구매
//  - 어느 탭·줄에 들어갈지는 아이템의 slot 으로 정한다 → 관리자 화면에서 slot 만 맞추면 새 아이템이 바로 나타남
//      slot=effect → 배경 탭 '이펙트' 줄 / slot=background → 배경 탭 '테마' 줄
//      slot=music  → 음악 탭 / 소모품(consumable) → 소모품 탭 / 그 밖의 slot → 배경 탭 '기타' 줄
//  - [ADDED 2026-11-12] slot=planet_effect → 소모품 탭 '행성 효과' 줄 (바다·구름·수정·성운·용암)
//      위에 샘플 행성 미리보기(카드를 누르면 그 효과로 바뀜). 소모품: 1개 = 행성 1개.
//      [구매]로 개수를 늘리고, 남은 개수가 있으면 [적용]으로 원하는 일기 행성에 적용(해제·변경하면 1개가 돌아온다)
//  - [ADDED 2026-11-21] slot=planet_surface → 소모품 탭 '행성 표면' 줄 (오팔 유리·솜사탕 구름·진주 실크·크리스탈 프리즘·오로라 리본)
//      행성 효과와 같은 규칙(소모품, 1개 = 행성 1개). 행성 하나에 표면 하나 + 효과 하나를 따로 고른다.
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';

import { ShopFrame, ShopSectionRule } from '@/components/ui/shop-frame';
import { DesignFonts } from '@/constants/ui-design';
import { PlanetDecorator } from '@/components/planet-decorator';
import { PlanetPreview } from '@/components/universe-scene';
import { showMessage } from '@/lib/feedback';
import { confirmChoice } from '@/lib/notice';
import type { ShopItem } from '@/lib/shop-api';
import { STARTER_CURSOR_ID, cursorEffect } from '@/lib/cursor-items';
import { PLANET_EFFECT_SLOT, SAMPLE_PLANET, effectOfItem, type SpecialType } from '@/lib/special-planet';
import { PLANET_SURFACE_SLOT, surfaceOfItem, type SurfaceStyle } from '@/lib/surface-style';
import { useDiary } from '@/store/diary-context';
import { useShop } from '@/store/shop-context';
import { UfoSprite } from '@/components/ufo-sprite';

const KNOWN_SLOTS = ['effect', 'background', 'music', 'cursor', PLANET_EFFECT_SLOT, PLANET_SURFACE_SLOT];

type DefaultCard = { name: string; icon: string; description: string };
type Section = {
  title: string;
  match: (item: ShopItem) => boolean;
  /** 같은 slot 의 장착을 모두 해제하는 무료 기본 카드 (예: 기본 우주) */
  defaultCard?: DefaultCard & { slot: string };
  emptyText?: string;
  /** 줄 위에 샘플 행성 미리보기를 보인다(행성 효과 줄 = effect, 행성 표면 줄 = surface) */
  preview?: 'effect' | 'surface';
};
type Tab = { id: string; label: string; sections: Section[] };

const TABS: Tab[] = [
  {
    id: 'background',
    label: '배경',
    sections: [
      { title: '이펙트', match: (i) => i.kind === 'equip' && i.slot === 'effect', emptyText: '아직 이펙트가 없어요.' },
      {
        title: '테마',
        match: (i) => i.kind === 'equip' && i.slot === 'background',
        defaultCard: { slot: 'background', name: '기본 우주', icon: '🌠', description: '처음 우주 배경' },
      },
      { title: '기타', match: (i) => i.kind === 'equip' && !KNOWN_SLOTS.includes(i.slot ?? '') },
    ],
  },
  {
    id: 'music',
    label: '음악',
    sections: [
      {
        title: '배경음악',
        match: (i) => i.kind === 'equip' && i.slot === 'music',
        defaultCard: { slot: 'music', name: '음악 끄기', icon: '🔇', description: '배경음악 없이' },
        emptyText: '아직 음악이 없어요. 관리자 화면에서 추가하면 바로 나타나요.',
      },
    ],
  },
  {
    id: 'cursor',
    label: '커서',
    sections: [{
      title: '커서 효과',
      match: (item) => item.kind === 'equip' && item.slot === 'cursor' && cursorEffect(item.effect) !== null,
      emptyText: '커서 상품을 불러올 수 없어요.',
    }],
  },
  {
    id: 'consumable',
    label: '소모품',
    sections: [
      // 행성 효과·표면도 소모품 종류지만 아래 자기 줄에만 보인다
      {
        title: '소모품',
        match: (i) => i.kind === 'consumable' && i.slot !== PLANET_EFFECT_SLOT && i.slot !== PLANET_SURFACE_SLOT,
        emptyText: '아직 소모품이 없어요.',
      },
      // [2026-11-21] 행성 표면(표면 재질) — 행성 효과(주변)와 따로 고른다
      {
        title: '행성 표면',
        match: (i) => i.slot === PLANET_SURFACE_SLOT,
        emptyText: '아직 행성 표면이 없어요.',
        preview: 'surface',
      },
      {
        title: '행성 효과',
        match: (i) => i.slot === PLANET_EFFECT_SLOT,
        emptyText: '아직 행성 효과가 없어요.',
        preview: 'effect',
      },
    ],
  },
];

type Action = { label: string; kind: 'buy' | 'equip' | 'unequip' | 'none'; disabled: boolean };

function actionFor(item: ShopItem, coins: number): Action {
  const owned = item.quantity > 0;
  if (item.kind === 'equip' && owned) {
    return item.equipped
      ? { label: '해제', kind: 'unequip', disabled: false }
      : { label: item.slot === 'cursor' ? '적용' : '장착', kind: 'equip', disabled: false };
  }
  if (!item.on_sale) return { label: '판매 종료', kind: 'none', disabled: true };
  if (coins < item.price) return { label: '코인 부족', kind: 'none', disabled: true };
  return { label: '구매', kind: 'buy', disabled: false };
}

function Card({
  icon,
  imageSource,
  artwork,
  name,
  description,
  priceText,
  badge,
  highlighted,
  previewing,
  onSelect,
  action,
  secondary,
  busy,
  disabledAll,
  onPress,
  testID,
  width,
}: {
  icon: string;
  imageSource?: ImageSourcePropType;
  artwork?: ReactNode;
  name: string;
  description: string;
  priceText: string;
  badge?: string;
  highlighted?: boolean;
  /** 미리보기 중인 카드(보라 테두리) */
  previewing?: boolean;
  /** 카드(버튼 바깥)를 누르면 미리보기 */
  onSelect?: () => void;
  action: Action;
  /** 두 번째 버튼(행성 효과의 [적용]). 있으면 버튼 두 개를 나란히 둔다 */
  secondary?: { label: string; onPress: () => void };
  busy: boolean;
  disabledAll: boolean;
  onPress: () => void;
  testID: string;
  width: number;
}) {
  const { t } = useLanguage();
  return (
    <Pressable
      disabled={!onSelect}
      onPress={onSelect}
      accessibilityLabel={onSelect ? `${name} 미리보기` : undefined}
      style={[styles.card, { width }, highlighted && styles.cardEquipped, previewing && styles.cardPreviewing]}
      testID={testID}>
      <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
        {[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, index) =>
          <View key={index} style={[styles.cardCorner, corner, previewing && styles.cardCornerPreviewing]} />)}
      </View>
      {badge && !highlighted ? <Text style={styles.badge}>{t(badge)}</Text> : null}
      <View style={styles.artwork}>
        {artwork ?? (imageSource ? <Image source={imageSource} style={styles.cursorImage} resizeMode="contain" accessibilityLabel={name} />
          : <Text style={styles.icon}>{icon}</Text>)}
      </View>
      <Text style={styles.name}>
        {name}
      </Text>
      <Text style={styles.desc}>
        {description}
      </Text>
      {/* 가격 줄은 항상 같은 높이 → 구매 후에도 버튼 위치가 그대로 */}
      <View style={styles.priceRow}><CoinIcon size={15} /><Text style={styles.price}>{t(priceText)}</Text></View>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID={`${testID}-action`}
          accessibilityLabel={`${name} ${action.label}`}
          disabled={action.disabled || disabledAll}
          onPress={onPress}
          hitSlop={{ top: 8, bottom: 8 }}
          style={[
            styles.button,
            // 버튼 줄(가로) 안에서는 늘이기(stretch)가 폭이 아니라 높이에 걸리므로, 하나든 둘이든 flex 로 폭을 채운다
            styles.buttonHalf,
            action.kind === 'unequip' && styles.buttonGhost,
            action.disabled && (action.kind === 'none' ? styles.buttonInactive : styles.buttonDisabled),
          ]}>
          {busy ? (
            <ActivityIndicator size="small" color={action.kind === 'unequip' ? '#fff' : '#000'} />
          ) : (
            <Text style={[styles.buttonText, (action.kind === 'unequip' || (action.disabled && action.kind === 'none')) && styles.buttonTextLight,
              action.disabled && action.kind !== 'none' && styles.buttonTextDisabled]}>{t(action.label)}</Text>
          )}
        </TouchableOpacity>
        {secondary ? (
          <TouchableOpacity
            testID={`${testID}-apply`}
            accessibilityLabel={`${name} ${secondary.label}`}
            disabled={disabledAll}
            onPress={secondary.onPress}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.button, styles.buttonHalf, styles.buttonApply]}>
            <Text style={styles.buttonText}>{t(secondary.label)}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * 행성 표면·효과 미리보기(하나만): 샘플 감정 행성(연분홍 '설렘·애정')에 고른 표면과 효과를 함께 실제 3D로 그린다.
 * [2026-11-23] 표면 줄·효과 줄에 하나씩 있던 미리보기를 하나로 합쳤다(표면 + 효과 조합을 바로 볼 수 있게).
 */
function PlanetLookPreview({
  surfaceItem,
  effectItem,
  visible,
}: {
  surfaceItem: ShopItem | undefined;
  effectItem: ShopItem | undefined;
  visible: boolean;
}) {
  const { t } = useLanguage();
  const surface = surfaceItem ? surfaceOfItem(surfaceItem) : null;
  const effect = effectItem ? effectOfItem(effectItem) : null;
  const names = [surfaceItem, effectItem].filter(Boolean).map((i) => `${i!.icon} ${i!.name}`);
  // 세로로 긴 칸(왼쪽 미리보기)에서는 카메라 화각이 세로 기준이라 행성·고리가 좌우로 넘친다 → 가로 폭에 맞춰 줄인다.
  // 3D 카메라 설정은 처음 만들 때만 적용되므로, 칸 크기를 잰 뒤에 그리고 비율이 바뀌면(0.05 단위) 다시 만든다.
  const [zoom, setZoom] = useState<number | null>(null);
  return (
    <View
      style={styles.preview}
      testID="shop-planet-preview"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setZoom(Math.round(Math.min(1, width / height) * 20) / 20);
      }}>
      {/* 행성 꾸미기 팝업이 떠 있으면 3D 화면을 하나만 쓰도록 잠시 내린다 */}
      {visible && zoom !== null ? (
        <PlanetPreview key={zoom} id="shop-sample" visual={SAMPLE_PLANET} radius={0.36} effect={effect} surface={surface} zoom={zoom} />
      ) : null}
      <Text style={styles.previewTag} pointerEvents="none">
        {t('미리보기 · 샘플 행성')}
      </Text>
      <Text style={styles.previewName} pointerEvents="none" testID="shop-preview-name">
        {names.length ? names.join('  +  ') : t('기본 행성')}
      </Text>
    </View>
  );
}

export function ShopSheet({ visible, onClose }: { visible: boolean; width: number; onClose: () => void }) {
  const { t } = useLanguage();
  const { coins, items, loading, error, refresh, purchase, setEquipped, resetAllowed, resetShop } = useShop();
  const { entries } = useDiary();
  const { height, width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth < 768;
  const sheetWidth = Math.min(viewportWidth - (compact ? 32 : 96), 1180);
  const sheetHeight = Math.min(height - 48, compact ? Math.min(height * 0.82, 720) : 700);
  const cardWidth = compact ? Math.min(CARD_WIDTH, Math.max(124, (sheetWidth - 32 - CARD_GAP - 4) / 2)) : CARD_WIDTH;
  const [tabId, setTabId] = useState(TABS[0].id);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 행성 표면·효과 줄: 미리보기 중인 표면·효과(하나의 미리보기에 함께), 행성 꾸미기 팝업(적용하기)
  const [preview, setPreview] = useState<{ surface: string | null; effect: string | null }>({ surface: null, effect: null });
  const [decorating, setDecorating] = useState<{ effect?: SpecialType; surface?: SurfaceStyle } | null>(null);
  // 효과·표면별로 적용된 행성 수 (카드 배지)
  const appliedCount = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) {
      if (e.effect) count.set(`effect:${e.effect}`, (count.get(`effect:${e.effect}`) ?? 0) + 1);
      if (e.surface) count.set(`surface:${e.surface}`, (count.get(`surface:${e.surface}`) ?? 0) + 1);
    }
    return count;
  }, [entries]);
  const balance = coins ?? 0;
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  const sections = useMemo(
    () =>
      tab.sections
        .map((section) => ({ section, list: items.filter(section.match) }))
        // '기타' 처럼 기본 카드·빈 안내가 없는 줄은 아이템이 있을 때만 보인다
        .filter(({ section, list }) => list.length > 0 || section.defaultCard || section.emptyText),
    [tab, items]
  );

  // 상품 줄 하나(제목 + 가로로 넘겨 보는 카드). index 는 탭 안에서의 순서(testID 에 쓴다)
  const renderSection = ({ section, list }: (typeof sections)[number], index: number) => {
    const slot = section.defaultCard?.slot;
    const slotInUse = slot ? list.some((i) => i.equipped && i.quantity > 0) : false;
    return (
      <View key={section.title} style={styles.section} testID={`shop-section-${section.title}`}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{t(section.title)}</Text>
          <ShopSectionRule />
        </View>
        {list.length === 0 && !section.defaultCard ? (
          <Text style={styles.empty}>{t(section.emptyText??'')}</Text>
        ) : (
          <ScrollArea horizontal hideScrollbarWhenNotScrollable contentContainerStyle={styles.row} scrollStep={cardWidth + CARD_GAP}
            label={t('{title} 상품 목록', { title: t(section.title) })}
            scrollbarLabel={t('{title} 가로 스크롤', { title: t(section.title) })} testID={`shop-row-${tab.id}-${index}`}>
            {section.defaultCard ? (
              <Card
                testID={`shop-item-default-${slot}`}
                width={cardWidth}
                icon={section.defaultCard.icon}
                name={t(section.defaultCard.name)}
                description={t(section.defaultCard.description)}
                priceText="무료"
                badge={slotInUse ? undefined : '사용 중'}
                highlighted={!slotInUse}
                action={slotInUse ? { label: '사용', kind: 'equip', disabled: false } : { label: '사용 중', kind: 'none', disabled: true }}
                busy={busyId === `default-${slot}`}
                disabledAll={busyId !== null}
                onPress={() => {
                  const current = list.find((i) => i.equipped && i.quantity > 0);
                  if (current) run(`default-${slot}`, () => setEquipped(current.id, false));
                }}
              />
            ) : null}
            {list.map((item) => {
              const owned = item.quantity > 0;
              const effect = section.preview === 'effect' ? effectOfItem(item) : null;
              const surface = section.preview === 'surface' ? surfaceOfItem(item) : null;
              const perPlanet = effect ?? surface;
              // 행성 효과·표면: 남은 개수 = 산 개수 − 적용 중인 행성 수
              const applied = effect
                ? (appliedCount.get(`effect:${effect}`) ?? 0)
                : surface
                  ? (appliedCount.get(`surface:${surface}`) ?? 0)
                  : 0;
              const left = Math.max(item.quantity - applied, 0);
              const previewing = section.preview ? preview[section.preview] === item.id : false;
              const cursor = item.slot === 'cursor' ? cursorEffect(item.effect) : null;
              return (
                <Card
                  key={item.id}
                  testID={`shop-item-${item.id}`}
                  width={cardWidth}
                  icon={item.icon}
                  imageSource={cursor?.style === 'astronaut_blue'
                    ? require('../../public/cursors/astronaut-blue-idle.png')
                    : cursor?.style === 'astronaut_pink'
                      ? require('../../public/cursors/astronaut-pink-idle.png') : undefined}
                  artwork={cursor?.style === 'ufo_mint' ? <UfoSprite pose="idle" size={android ? 44 : 56} /> : undefined}
                  name={item.id === STARTER_CURSOR_ID ? t(item.name) : item.name}
                  description={item.id === STARTER_CURSOR_ID ? t(item.description) : item.description}
                  priceText={item.id === STARTER_CURSOR_ID ? '기본 제공' : item.kind === 'equip' && owned ? '보유 중' : String(item.price)}
                  badge={
                    perPlanet
                      ? owned
                        ? left > 0
                          ? t('남은 {left}/{total}개',{left,total:item.quantity})
                          : '모두 사용 중'
                        : undefined
                      : item.equipped
                        ? '장착 중'
                        : item.kind === 'consumable' && owned
                          ? t('보유 {count}개',{count:item.quantity})
                          : undefined
                  }
                  secondary={
                    perPlanet && left > 0
                      ? { label: '적용', onPress: () => setDecorating(effect ? { effect } : { surface: surface ?? undefined }) }
                      : undefined
                  }
                  highlighted={item.equipped}
                  previewing={previewing}
                  onSelect={
                    section.preview
                      ? () => {
                          const kind = section.preview!;
                          setPreview((p) => ({ ...p, [kind]: p[kind] === item.id ? null : item.id }));
                        }
                      : undefined
                  }
                  action={actionFor(item, balance)}
                  busy={busyId === item.id}
                  disabledAll={busyId !== null}
                  onPress={() => onItemPress(item)}
                />
              );
            })}
          </ScrollArea>
        )}
        {list.length === 0 && section.defaultCard && section.emptyText ? (
          <Text style={styles.empty}>{t(section.emptyText??'')}</Text>
        ) : null}
      </View>
    );
  };

  // [2026-11-24] 소모품 탭: 행성 표면·효과 줄은 [미리보기 | 표면 줄 / 효과 줄] 배치로 묶는다(좁은 화면은 위아래로)
  const indexed = sections.map((entry, index) => ({ entry, index }));
  const lookSections = indexed.filter(({ entry }) => entry.section.preview);

  const run = async (id: string, task: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusyId(id);
    const result = await task();
    setBusyId(null);
    if (!result.ok) showMessage(t('실패'), result.error);
  };

  const onItemPress = (item: ShopItem) => {
    const action = actionFor(item, balance);
    if (action.disabled || action.kind === 'none' || busyId) return;
    if (action.kind === 'buy') {
      const note = item.slot === PLANET_EFFECT_SLOT || item.slot === PLANET_SURFACE_SLOT ? `\n${t('1개로 행성 1개를 꾸밀 수 있어요.')}` : '';
      confirmChoice(t('구매'), `${item.icon} ${t('{name}을(를) {price}코인에 살까요?',{name:item.name,price:item.price})}${note}`, t('구매'), () =>
        run(item.id, () => purchase(item.id))
      );
      return;
    }
    run(item.id, () => setEquipped(item.id, action.kind === 'equip'));
  };

  const onReset = () => {
    if (busyId) return;
    confirmChoice(
      t('내 상점 초기화 (테스트용)'),
      t('코인이 시작 코인으로 돌아가고, 산 아이템과 코인 기록이 모두 지워집니다.'),
      t('초기화'),
      () => run('__reset__', resetShop)
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* 창 바깥(어두운 부분)을 누르면 닫힘 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("상점 닫기")} testID="shop-backdrop" />
        <View
          testID="shop-sheet"
          style={[
            styles.sheet,
            compact && styles.sheetCompact,
            { width: sheetWidth, height: sheetHeight },
          ]}>
          <ShopFrame fill="#1F2025" />
          <View style={[styles.header, compact && styles.headerCompact]}>
            <Text style={[styles.title, compact && styles.titleCompact, viewportWidth < 360 && styles.titleNarrow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>SPACE SHOP</Text>
            <View style={styles.headerRight}>
              <View style={styles.coinBalance} testID="shop-coins">
                <CoinIcon size={16} /><Text style={styles.coinText} numberOfLines={1}>{coins?.toLocaleString() ?? '…'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityLabel={t("닫기")} testID="shop-close" hitSlop={10} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.tabs, compact && styles.tabsCompact]}>
            {TABS.map((tabItem) => (
              <TouchableOpacity
                key={tabItem.id}
                testID={`shop-tab-${tabItem.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: tabItem.id === tab.id }}
                onPress={() => setTabId(tabItem.id)}
                style={styles.tab}>
                <ShopFrame tab cut={12} fill={tabItem.id === tab.id ? '#D9D9D9' : '#55565A'} />
                <Text style={[styles.tabText, compact && styles.tabTextCompact, tabItem.id === tab.id && styles.tabTextActive]}>{t(tabItem.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? (
            <TouchableOpacity style={styles.errorBox} onPress={refresh}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorRetry}>{t("눌러서 다시 시도")}</Text>
            </TouchableOpacity>
          ) : null}
          {loading && coins === null ? <ActivityIndicator color="#fff" style={styles.loading} /> : null}

          <ScrollArea key={tab.id} hideScrollbarWhenNotScrollable style={[styles.body, compact && styles.bodyCompact]} contentContainerStyle={styles.bodyContent}
            label={t('상점 상품 목록')} scrollbarLabel={t('상점 세로 스크롤')} testID="shop-scroll">
            {indexed.filter(({ entry }) => !entry.section.preview).map(({ entry, index }) => renderSection(entry, index))}
            {lookSections.length > 0 ? (
              <View style={[styles.look, compact && styles.lookCompact]} testID="shop-planet-look">
                <View style={[styles.lookPreview, compact && styles.lookPreviewCompact]}>
                  <PlanetLookPreview
                    surfaceItem={items.find((i) => i.id === preview.surface)}
                    effectItem={items.find((i) => i.id === preview.effect)}
                    visible={visible && decorating === null}
                  />
                  <Text style={styles.previewHint}>
                    {t('표면 카드와 효과 카드를 누르면 함께 미리 볼 수 있어요. 한 번 더 누르면 빠져요. 감정으로 정해진 색과 무늬는 그대로예요.')}
                  </Text>
                </View>
                <View style={styles.lookRows}>
                  {lookSections.map(({ entry, index }) => renderSection(entry, index))}
                </View>
              </View>
            ) : null}

            {resetAllowed && items.length > 0 ? (
              <TouchableOpacity
                style={styles.reset}
                onPress={onReset}
                disabled={busyId !== null}
                testID="shop-reset"
                accessibilityLabel={t("내 상점 초기화")}>
                {busyId === '__reset__' ? (
                  <ActivityIndicator size="small" color="#F66C9E" />
                ) : (
                  <Text style={styles.resetText}>{t("↺ 내 상점 초기화 (테스트용)")}</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </ScrollArea>
        </View>
      </View>
      {/* 적용하기 → 행성 고르기 → 미리보기 → 적용 */}
      <PlanetDecorator
        visible={decorating !== null}
        effect={decorating?.effect ?? null}
        surface={decorating?.surface ?? null}
        onClose={() => setDecorating(null)}
      />
    </Modal>
  );
}

const android = Platform.OS === 'android';
const CARD_WIDTH = android ? 138 : 164;
const CARD_GAP = android ? 10 : 14;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 56,
  },
  sheetCompact: { paddingTop: android ? 18 : 26, paddingBottom: android ? 20 : 28, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingBottom: 10, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#D9D9D9' },
  headerCompact: { minHeight: android ? 40 : 46, marginBottom: android ? 10 : 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: '#fff', fontFamily: DesignFonts.bold, fontSize: 30, flex: 1, minWidth: 0 },
  titleCompact: { fontSize: android ? 21 : 24 },
  titleNarrow: { fontSize: 18 },
  coinBalance: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  close: { width: 24, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', gap: 16, marginHorizontal: 48, marginBottom: 24 },
  tabsCompact: { gap: 10, marginHorizontal: 0, marginBottom: android ? 12 : 18 },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    justifyContent: 'center',
    paddingVertical: android ? 5 : 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tabText: { color: '#fff', fontSize: 18 },
  tabTextCompact: { fontSize: 14 },
  tabTextActive: { color: '#000' },
  errorBox: { backgroundColor: '#3A1F2E', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#F66C9E', fontSize: 13 },
  errorRetry: { color: '#fff', fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  loading: { marginTop: 20 },
  body: { flex: 1, minHeight: 0, marginHorizontal: 48 },
  bodyCompact: { marginHorizontal: 0 },
  bodyContent: { paddingBottom: 4 },
  section: { marginBottom: android ? 12 : 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: android ? 6 : 10 },
  sectionTitle: { color: '#fff', fontSize: 22 },
  sectionTitleCompact: { fontSize: 16 },
  empty: { color: '#ADADB2', fontSize: 12, marginBottom: 6, marginTop: 4 },
  row: { gap: CARD_GAP, padding: 2, alignItems: 'stretch' },
  card: {
    flexShrink: 0,
    paddingHorizontal: android ? 8 : 12,
    paddingVertical: android ? 7 : 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#858589',
  },
  cardEquipped: { borderColor: '#D9D9D9', outlineColor: '#D9D9D9', outlineWidth: 2, outlineStyle: 'solid' },
  cardPreviewing: { borderColor: '#B888FF' },
  cardCorner: { position: 'absolute', width: 13, height: 13, borderColor: '#D9D9D9' },
  cardCornerPreviewing: { borderColor: '#B888FF' },
  topLeft: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3 },
  look: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  lookCompact: { flexDirection: 'column', gap: 0 },
  lookPreview: { width: '36%', paddingBottom: 18 },
  lookPreviewCompact: { width: '100%', paddingBottom: 0 },
  lookRows: { flex: 1, minWidth: 0 },
  preview: {
    flex: 1,
    minHeight: android ? 144 : 200,
    overflow: 'hidden',
    backgroundColor: '#17181D',
    borderWidth: 1,
    borderColor: '#747478',
    marginBottom: 8,
  },
  previewTag: { position: 'absolute', top: 8, left: 10, color: '#D9D9D9', fontSize: 12 },
  previewName: { position: 'absolute', bottom: 8, left: 10, color: '#fff', fontSize: 13, fontWeight: 'bold' },
  previewHint: { color: '#ADADB2', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 6,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#D9D9D9',
  },
  artwork: { minHeight: android ? 50 : 64, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: android ? 36 : 46, lineHeight: android ? 44 : 56 },
  cursorImage: { width: android ? 44 : 56, height: android ? 44 : 56 },
  name: { alignSelf: 'stretch', fontSize: 14, lineHeight: android ? 19 : 22, marginBottom: android ? 3 : 6, color: '#fff', textAlign: 'center', flexShrink: 0 },
  desc: { alignSelf: 'stretch', fontSize: 13, lineHeight: android ? 17 : 20, color: '#C4C4CA', textAlign: 'center', marginBottom: android ? 5 : 10, minHeight: android ? 34 : 40, flexShrink: 0 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 22, marginBottom: 6, marginTop: 'auto' },
  price: { fontSize: 12, lineHeight: 18, color: '#fff' },
  button: {
    backgroundColor: '#D9D9D9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    paddingVertical: 3,
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 28,
    justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  buttonHalf: { flex: 1, alignSelf: 'auto' },
  buttonApply: { backgroundColor: '#D9D9D9' },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonInactive: { backgroundColor: 'transparent' },
  buttonDisabled: { backgroundColor: '#858589', borderColor: '#858589' },
  buttonText: { fontSize: 13, lineHeight: 20, color: '#000', textAlign: 'center', flexShrink: 1 },
  buttonTextLight: { color: '#fff' },
  buttonTextDisabled: { color: '#555' },
  reset: {
    marginTop: 22,
    marginBottom: 16,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#F66C9E',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: android ? 7 : 10,
    minWidth: 200,
    alignItems: 'center',
  },
  resetText: { color: '#F66C9E', fontSize: 13, fontWeight: '600' },
});
