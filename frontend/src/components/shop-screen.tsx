// [MODIFIED 2026-11-10] 상점 팝업 (fffju 상점 카드 디자인 + 서버 코인·구매·장착).
//  - 화면 가운데 뜨는 창 (2026-11-10 아래 → 가운데로 변경). ✕ 버튼, 창 바깥 누르기, 안드로이드 뒤로가기로 닫힘
//  - 탭: 배경(이펙트 줄 / 테마 줄) · 음악 · 소모품
//  - 각 줄은 가로로 넘겨 보는 카드 목록. 산 것은 장착/해제, 안 산 것은 구매
//  - 어느 탭·줄에 들어갈지는 아이템의 slot 으로 정한다 → 관리자 화면에서 slot 만 맞추면 새 아이템이 바로 나타남
//      slot=effect → 배경 탭 '이펙트' 줄 / slot=background → 배경 탭 '테마' 줄
//      slot=music  → 음악 탭 / 소모품(consumable) → 소모품 탭 / 그 밖의 slot → 배경 탭 '기타' 줄
//  - [ADDED 2026-11-12] slot=planet_effect → 소모품 탭 '행성 효과' 줄 (바다·구름·수정·성운·용암)
//      위에 샘플 행성 미리보기(카드를 누르면 그 효과로 바뀜). 소모품: 1개 = 행성 1개.
//      [구매]로 개수를 늘리고, 남은 개수가 있으면 [적용]으로 원하는 일기 행성에 적용(해제·변경하면 1개가 돌아온다)
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { SpaceSurface, SpaceIcon } from '@/components/ui/space-ui';
import { DesignFonts } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { PlanetDecorator } from '@/components/planet-decorator';
import { PlanetPreview } from '@/components/universe-scene';
import { showMessage } from '@/lib/feedback';
import { confirmChoice } from '@/lib/notice';
import type { ShopItem } from '@/lib/shop-api';
import { PLANET_EFFECT_SLOT, SAMPLE_PLANET, effectOfItem, type SpecialType } from '@/lib/special-planet';
import { useDiary } from '@/store/diary-context';
import { useShop } from '@/store/shop-context';

const KNOWN_SLOTS = ['effect', 'background', 'music', PLANET_EFFECT_SLOT];

type DefaultCard = { name: string; icon: string; description: string };
type Section = {
  title: string;
  match: (item: ShopItem) => boolean;
  /** 같은 slot 의 장착을 모두 해제하는 무료 기본 카드 (예: 기본 우주) */
  defaultCard?: DefaultCard & { slot: string };
  emptyText?: string;
  /** 줄 위에 샘플 행성 효과 미리보기를 보인다(행성 효과 줄) */
  preview?: boolean;
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
    id: 'consumable',
    label: '소모품',
    sections: [
      // 행성 효과도 소모품 종류지만 아래 자기 줄에만 보인다
      { title: '소모품', match: (i) => i.kind === 'consumable' && i.slot !== PLANET_EFFECT_SLOT, emptyText: '아직 소모품이 없어요.' },
      {
        title: '행성 효과',
        match: (i) => i.slot === PLANET_EFFECT_SLOT,
        emptyText: '아직 행성 효과가 없어요.',
        preview: true,
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
      : { label: '장착', kind: 'equip', disabled: false };
  }
  if (!item.on_sale) return { label: '판매 종료', kind: 'none', disabled: true };
  if (coins < item.price) return { label: '코인 부족', kind: 'none', disabled: true };
  return { label: '구매', kind: 'buy', disabled: false };
}

function Card({
  icon,
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
}: {
  icon: string;
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
}) {
  return (
    <Pressable
      disabled={!onSelect}
      onPress={onSelect}
      accessibilityLabel={onSelect ? `${name} 미리보기` : undefined}
      style={[styles.card, highlighted && styles.cardEquipped, previewing && styles.cardPreviewing]}
      testID={testID}>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.desc} numberOfLines={2}>
        {description}
      </Text>
      {/* 가격 줄은 항상 같은 높이 → 구매 후에도 버튼 위치가 그대로 */}
      <Text style={styles.price}>{priceText}</Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID={`${testID}-action`}
          accessibilityLabel={`${name} ${action.label}`}
          disabled={action.disabled || disabledAll}
          onPress={onPress}
          style={[
            styles.button,
            // 버튼 줄(가로) 안에서는 늘이기(stretch)가 폭이 아니라 높이에 걸리므로, 하나든 둘이든 flex 로 폭을 채운다
            styles.buttonHalf,
            action.kind === 'unequip' && styles.buttonGhost,
            action.disabled && styles.buttonDisabled,
          ]}>
          {busy ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={[styles.buttonText, action.disabled && styles.buttonTextDisabled]}>{action.label}</Text>
          )}
        </TouchableOpacity>
        {secondary ? (
          <TouchableOpacity
            testID={`${testID}-apply`}
            accessibilityLabel={`${name} ${secondary.label}`}
            disabled={disabledAll}
            onPress={secondary.onPress}
            style={[styles.button, styles.buttonHalf, styles.buttonApply]}>
            <Text style={styles.buttonText}>{secondary.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Pressable>
  );
}

/** 행성 효과 줄 위의 미리보기: 샘플 감정 행성(연분홍 '설렘·애정')에 고른 효과를 실제 3D로 그린다. */
function EffectPreview({ item, visible }: { item: ShopItem | undefined; visible: boolean }) {
  const effect = item ? effectOfItem(item) : null;
  return (
    <View style={styles.preview} testID="shop-effect-preview">
      {/* 행성 꾸미기 팝업이 떠 있으면 3D 화면을 하나만 쓰도록 잠시 내린다 */}
      {visible ? <PlanetPreview id="shop-sample" visual={SAMPLE_PLANET} radius={0.36} effect={effect} /> : null}
      <Text style={styles.previewTag} pointerEvents="none">
        미리보기 · 샘플 행성
      </Text>
      {item ? (
        <Text style={styles.previewName} pointerEvents="none">
          {item.icon} {item.name}
        </Text>
      ) : null}
    </View>
  );
}

export function ShopSheet({ visible, onClose }: { visible: boolean; width: number; onClose: () => void }) {
  const { coins, items, loading, error, refresh, purchase, setEquipped, resetAllowed, resetShop } = useShop();
  const { entries } = useDiary();
  const { height, width: viewportWidth } = useWindowDimensions();
  const { scale } = useResponsiveLayout();
  const [tabId, setTabId] = useState(TABS[0].id);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 행성 효과 줄: 미리보기 중인 아이템, 행성 꾸미기 팝업(적용하기)
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [decorating, setDecorating] = useState<SpecialType | null>(null);
  // 효과별로 적용된 행성 수 (카드 배지)
  const appliedCount = useMemo(() => {
    const count = new Map<SpecialType, number>();
    for (const e of entries) if (e.effect) count.set(e.effect, (count.get(e.effect) ?? 0) + 1);
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

  const run = async (id: string, task: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusyId(id);
    const result = await task();
    setBusyId(null);
    if (!result.ok) showMessage('실패', result.error);
  };

  const onItemPress = (item: ShopItem) => {
    const action = actionFor(item, balance);
    if (action.disabled || action.kind === 'none' || busyId) return;
    if (action.kind === 'buy') {
      const note = item.slot === PLANET_EFFECT_SLOT ? '\n1개로 행성 1개를 꾸밀 수 있어요.' : '';
      confirmChoice('구매', `${item.icon} ${item.name}을(를) 🪙 ${item.price}에 살까요?${note}`, '구매', () =>
        run(item.id, () => purchase(item.id))
      );
      return;
    }
    run(item.id, () => setEquipped(item.id, action.kind === 'equip'));
  };

  const onReset = () => {
    if (busyId) return;
    confirmChoice(
      '내 상점 초기화 (테스트용)',
      '코인이 시작 코인으로 돌아가고, 산 아이템과 코인 기록이 모두 지워집니다.',
      '초기화',
      () => run('__reset__', resetShop)
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* 창 바깥(어두운 부분)을 누르면 닫힘 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="상점 닫기" testID="shop-backdrop" />
        <SpaceSurface
          testID="shop-sheet"
          style={[
            styles.sheet,
            { width: Math.min(viewportWidth - 24, 960), maxHeight: height - 48, height: Math.min(height * 0.8, 760), paddingBottom: 12 },
          ]}>
          <View style={styles.header}>
            {/* 왼쪽 칸은 나중에 넣을 기능 자리 (예전 뒤로가기 위치) */}
            <SpaceIcon kind="group" size={28 * scale} />
            <Text style={styles.title}>SPACE SHOP</Text>
            <View style={[styles.headerSide, styles.headerRight]}>
              <View style={styles.coinPill} testID="shop-coins">
                <Text style={styles.coinText}>🪙 {coins ?? '…'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityLabel="닫기" testID="shop-close" hitSlop={10} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tabs}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                testID={`shop-tab-${t.id}`}
                onPress={() => setTabId(t.id)}
                style={[styles.tab, t.id === tab.id && styles.tabActive]}>
                <Text style={[styles.tabText, t.id === tab.id && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? (
            <TouchableOpacity style={styles.errorBox} onPress={refresh}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorRetry}>눌러서 다시 시도</Text>
            </TouchableOpacity>
          ) : null}
          {loading && items.length === 0 ? <ActivityIndicator color="#fff" style={styles.loading} /> : null}

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {sections.map(({ section, list }, index) => {
              const slot = section.defaultCard?.slot;
              const slotInUse = slot ? list.some((i) => i.equipped && i.quantity > 0) : false;
              return (
                <View key={section.title} testID={`shop-section-${section.title}`}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.preview && list.length > 0 ? (
                    <>
                      <EffectPreview
                        item={list.find((i) => i.id === previewId) ?? list[0]}
                        visible={visible && decorating === null}
                      />
                      <Text style={styles.previewHint}>
                        카드를 누르면 미리 볼 수 있어요. 행성 색과 무늬는 그대로, 주변 효과만 더해져요.
                      </Text>
                    </>
                  ) : null}
                  {list.length === 0 && !section.defaultCard ? (
                    <Text style={styles.empty}>{section.emptyText}</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                      {section.defaultCard ? (
                        <Card
                          testID={`shop-item-default-${slot}`}
                          icon={section.defaultCard.icon}
                          name={section.defaultCard.name}
                          description={section.defaultCard.description}
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
                        const effect = section.preview ? effectOfItem(item) : null;
                        // 행성 효과: 남은 개수 = 산 개수 − 적용 중인 행성 수
                        const applied = effect ? (appliedCount.get(effect) ?? 0) : 0;
                        const left = Math.max(item.quantity - applied, 0);
                        const previewing = section.preview && (previewId ?? list[0]?.id) === item.id;
                        return (
                          <Card
                            key={item.id}
                            testID={`shop-item-${item.id}`}
                            icon={item.icon}
                            name={item.name}
                            description={item.description}
                            priceText={item.kind === 'equip' && owned ? '보유 중' : `🪙 ${item.price}`}
                            badge={
                              effect
                                ? owned
                                  ? left > 0
                                    ? `남은 ${left}/${item.quantity}개`
                                    : '모두 사용 중'
                                  : undefined
                                : item.equipped
                                  ? '장착 중'
                                  : item.kind === 'consumable' && owned
                                    ? `보유 ${item.quantity}개`
                                    : undefined
                            }
                            secondary={effect && left > 0 ? { label: '적용', onPress: () => setDecorating(effect) } : undefined}
                            highlighted={item.equipped}
                            previewing={previewing}
                            onSelect={section.preview ? () => setPreviewId(item.id) : undefined}
                            action={actionFor(item, balance)}
                            busy={busyId === item.id}
                            disabledAll={busyId !== null}
                            onPress={() => onItemPress(item)}
                          />
                        );
                      })}
                    </ScrollView>
                  )}
                  {list.length === 0 && section.defaultCard && section.emptyText ? (
                    <Text style={styles.empty}>{section.emptyText}</Text>
                  ) : null}
                </View>
              );
            })}

            {resetAllowed && items.length > 0 ? (
              <TouchableOpacity
                style={styles.reset}
                onPress={onReset}
                disabled={busyId !== null}
                testID="shop-reset"
                accessibilityLabel="내 상점 초기화">
                {busyId === '__reset__' ? (
                  <ActivityIndicator size="small" color="#F66C9E" />
                ) : (
                  <Text style={styles.resetText}>↺ 내 상점 초기화 (테스트용)</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </SpaceSurface>
      </View>
      {/* 적용하기 → 행성 고르기 → 미리보기 → 적용 */}
      <PlanetDecorator visible={decorating !== null} effect={decorating} onClose={() => setDecorating(null)} />
    </Modal>
  );
}

const CARD_WIDTH = 140;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: 'rgba(12,16,24,0.96)',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#3A3A4A',
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerSide: { width: 120 },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  title: { color: '#fff', fontFamily: DesignFonts.bold, fontSize: 18, fontWeight: 'bold', flexShrink: 1 },
  coinPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  coinText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#1d1d26',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2f2f3d',
  },
  tabActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  tabText: { color: '#c8c8d8', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#000' },
  errorBox: { backgroundColor: '#3A1F2E', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#F66C9E', fontSize: 13 },
  errorRetry: { color: '#fff', fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  loading: { marginTop: 20 },
  body: { flex: 1 },
  divider: { height: 1, backgroundColor: '#3A3A4A', marginVertical: 14 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  empty: { color: '#9C9CC0', fontSize: 12, marginBottom: 6, marginTop: 4 },
  row: { gap: 10, paddingRight: 4 },
  card: {
    backgroundColor: 'rgba(16,21,31,0.82)',
    width: CARD_WIDTH,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  cardEquipped: { borderColor: '#ffffff' },
  cardPreviewing: { borderColor: '#B888FF' },
  preview: {
    height: 170,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#05050c',
    borderWidth: 1,
    borderColor: '#2f2f3d',
    marginBottom: 8,
  },
  previewTag: { position: 'absolute', top: 8, left: 10, color: '#B888FF', fontSize: 11, fontWeight: 'bold' },
  previewName: { position: 'absolute', bottom: 8, left: 10, color: '#fff', fontSize: 13, fontWeight: 'bold' },
  previewHint: { color: '#9C9CC0', fontSize: 11, lineHeight: 16, marginBottom: 10 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  icon: { fontSize: 40, marginTop: 8, marginBottom: 8 },
  name: { fontFamily: DesignFonts.bold, fontSize: 14, fontWeight: 'bold', marginBottom: 4, color: '#fff' },
  desc: { fontSize: 10, lineHeight: 14, color: '#aeb7c4', textAlign: 'center', marginBottom: 8, height: 28 },
  price: { fontWeight: 'bold', fontSize: 14, lineHeight: 20, color: '#fff', marginBottom: 8 },
  button: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 7,
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  buttonHalf: { flex: 1, alignSelf: 'auto' },
  buttonApply: { backgroundColor: '#B888FF' },
  buttonGhost: { backgroundColor: '#dfe6e9' },
  buttonDisabled: { backgroundColor: '#95a5a6' },
  buttonText: { fontWeight: 'bold', fontSize: 13, color: '#000' },
  buttonTextDisabled: { color: '#555' },
  reset: {
    marginTop: 22,
    marginBottom: 16,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#F66C9E',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  resetText: { color: '#F66C9E', fontSize: 13, fontWeight: '600' },
});
