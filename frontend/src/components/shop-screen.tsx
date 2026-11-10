// [MODIFIED 2026-11-10] 상점 팝업 (fffju 상점 카드 디자인 + 서버 코인·구매·장착).
//  - 아래에서 올라오는 창. ✕ 버튼, 창 바깥 누르기, 안드로이드 뒤로가기로 닫힘
//  - 탭: 배경(이펙트 줄 / 테마 줄) · 음악 · 소모품
//  - 각 줄은 가로로 넘겨 보는 카드 목록. 산 것은 장착/해제, 안 산 것은 구매
//  - 어느 탭·줄에 들어갈지는 아이템의 slot 으로 정한다 → 관리자 화면에서 slot 만 맞추면 새 아이템이 바로 나타남
//      slot=effect → 배경 탭 '이펙트' 줄 / slot=background → 배경 탭 '테마' 줄
//      slot=music  → 음악 탭 / 소모품(consumable) → 소모품 탭 / 그 밖의 slot → 배경 탭 '기타' 줄
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showMessage } from '@/lib/feedback';
import { confirmChoice } from '@/lib/notice';
import type { ShopItem } from '@/lib/shop-api';
import { useShop } from '@/store/shop-context';

const KNOWN_SLOTS = ['effect', 'background', 'music'];

type DefaultCard = { name: string; icon: string; description: string };
type Section = {
  title: string;
  match: (item: ShopItem) => boolean;
  /** 같은 slot 의 장착을 모두 해제하는 무료 기본 카드 (예: 기본 우주) */
  defaultCard?: DefaultCard & { slot: string };
  emptyText?: string;
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
    sections: [{ title: '소모품', match: (i) => i.kind === 'consumable', emptyText: '아직 소모품이 없어요.' }],
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
  action,
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
  action: Action;
  busy: boolean;
  disabledAll: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <View style={[styles.card, highlighted && styles.cardEquipped]} testID={testID}>
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
      <TouchableOpacity
        testID={`${testID}-action`}
        accessibilityLabel={`${name} ${action.label}`}
        disabled={action.disabled || disabledAll}
        onPress={onPress}
        style={[styles.button, action.kind === 'unequip' && styles.buttonGhost, action.disabled && styles.buttonDisabled]}>
        {busy ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text style={[styles.buttonText, action.disabled && styles.buttonTextDisabled]}>{action.label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function ShopSheet({ visible, width, onClose }: { visible: boolean; width: number; onClose: () => void }) {
  const { coins, items, loading, error, refresh, purchase, setEquipped, resetAllowed, resetShop } = useShop();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tabId, setTabId] = useState(TABS[0].id);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      confirmChoice('구매', `${item.icon} ${item.name}을(를) 🪙 ${item.price}에 살까요?`, '구매', () =>
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
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* 창 바깥(위쪽 어두운 부분)을 누르면 닫힘 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="상점 닫기" testID="shop-backdrop" />
        <View
          testID="shop-sheet"
          style={[
            styles.sheet,
            { width, height: Math.min(height * 0.82, 760), paddingBottom: Math.max(insets.bottom, 12) },
          ]}>
          <View style={styles.header}>
            {/* 왼쪽 칸은 나중에 넣을 기능 자리 (예전 뒤로가기 위치) */}
            <View style={styles.headerSide} />
            <Text style={styles.title}>🛍️ 상점</Text>
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
                        return (
                          <Card
                            key={item.id}
                            testID={`shop-item-${item.id}`}
                            icon={item.icon}
                            name={item.name}
                            description={item.description}
                            priceText={item.kind === 'equip' && owned ? '보유 중' : `🪙 ${item.price}`}
                            badge={item.equipped ? '장착 중' : item.kind === 'consumable' && owned ? `보유 ${item.quantity}개` : undefined}
                            highlighted={item.equipped}
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
        </View>
      </View>
    </Modal>
  );
}

const CARD_WIDTH = 140;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    backgroundColor: '#000',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#3A3A4A',
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerSide: { width: 120 },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
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
  tabActive: { backgroundColor: '#FED240', borderColor: '#FED240' },
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
    backgroundColor: '#b2bec3',
    width: CARD_WIDTH,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardEquipped: { borderColor: '#FED240' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
    backgroundColor: '#FED240',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  icon: { fontSize: 40, marginTop: 8, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: 'bold', marginBottom: 4, color: '#000' },
  desc: { fontSize: 10, lineHeight: 14, color: '#2d3436', textAlign: 'center', marginBottom: 8, height: 28 },
  price: { fontWeight: 'bold', fontSize: 14, lineHeight: 20, color: '#000', marginBottom: 8 },
  button: {
    backgroundColor: '#FED240',
    borderRadius: 8,
    paddingVertical: 7,
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
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
