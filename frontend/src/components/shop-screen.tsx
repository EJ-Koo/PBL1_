// front 브랜치 frontend/src/app/index.jsx의 'shop' 화면을 그대로 이식.
// 기존 상품 전시는 유지하고, UFO 커서는 실제 코인·구매·장착 API에 연결한다.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { UfoSprite } from '@/components/ufo-sprite';
import { UFO_DESCRIPTION, UFO_ITEM_ID, UFO_NAME, type UfoPose } from '@/lib/ufo-art';
import { useShop } from '@/store/shop-context';

const SHOP_ITEMS = [
  { icon: '❄️', name: '프리즘', desc: '연속 출석 멈춤을 1회 방어할 수 있다.', price: 30 },
  { icon: '🌌', name: '배경 (blue)', desc: '나의 우주 배경을 바꿀 수 있다.', price: 50 },
  { icon: '☄️', name: '혜성', desc: '5초마다 나의 우주에 혜성이 떨어진다.', price: 30 },
  { icon: '🌃', name: '배경 (black)', desc: '나의 우주 배경을 바꿀 수 있다.', price: 50 },
];
const UFO_PREVIEWS: { pose: UfoPose; label: string }[] = [
  { pose: 'idle', label: '기본' }, { pose: 'swim', label: '좌우 이동' }, { pose: 'beam', label: '클릭' },
];

export function ShopScreen({ onClose }: { onClose?: () => void } = {}) {
  const { coins, items, loading, error, busy, refresh, purchase, setEquipped } = useShop();
  const [feedback, setFeedback] = useState<string | null>(null);
  const ufo = items.find(item => item.id === UFO_ITEM_ID);
  const owned = (ufo?.quantity ?? 0) > 0;
  const price = ufo?.price ?? 50;
  const unavailable = !ufo || (!owned && !ufo.on_sale);
  const insufficient = !owned && coins !== null && coins < price;
  const disabled = loading || busy !== null || unavailable || (!owned && (coins === null || insufficient));
  const actionLabel = loading ? '불러오는 중…' : !ufo ? '판매 준비 중'
    : owned ? ufo.equipped ? '장착 해제' : '장착하기'
      : !ufo.on_sale ? '판매 종료' : insufficient ? '코인 부족' : `${price}코인 · 구매하기`;

  const handleUfoAction = async () => {
    if (!ufo || disabled) return;
    setFeedback(null);
    const result = owned ? await setEquipped(ufo.id, !ufo.equipped) : await purchase(ufo.id);
    setFeedback(result.ok
      ? owned ? ufo.equipped ? 'UFO 커서를 해제했어요.' : 'UFO 커서를 장착했어요. 마우스를 움직이거나 클릭해 보세요.'
        : 'UFO를 구매했어요. 장착하기를 눌러 사용해 보세요.'
      : result.error);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛍️ 상점</Text>
        <View style={styles.headerRight}>
          <View style={styles.coinPill}>
            <Text style={styles.coinText}>🪙 {coins ?? '—'}</Text>
          </View>
          {onClose && (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {error && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>상점을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Text>
            <Pressable accessibilityRole="button" onPress={() => { void refresh(); }} style={styles.retryButton}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        )}
        {feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
        <View style={styles.grid}>
          <View style={[styles.itemCard, styles.ufoCard]}>
            <View style={styles.ufoBadge}>
              <Text style={styles.ufoBadgeText}>{ufo?.equipped ? '장착 중' : owned ? '보유 중' : '커서 효과'}</Text>
            </View>
            <View style={styles.previewRow}>
              {UFO_PREVIEWS.map(({ pose, label }) => (
                <View key={pose} style={styles.preview}>
                  <UfoSprite pose={pose} size={36} />
                  <Text style={styles.previewLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.itemName}>{ufo?.name ?? UFO_NAME}</Text>
            <Text style={styles.itemDesc}>{ufo?.description ?? UFO_DESCRIPTION}</Text>
            <Text style={styles.priceText}>🪙 {price}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`UFO(민트) ${actionLabel}`}
              accessibilityState={{ disabled, busy: busy === UFO_ITEM_ID, selected: ufo?.equipped ?? false }}
              disabled={disabled}
              onPress={() => { void handleUfoAction(); }}
              style={({ pressed }) => [styles.actionButton, disabled && styles.disabledButton, pressed && styles.pressedButton]}
            >
              <Text style={styles.actionText}>{busy === UFO_ITEM_ID ? '처리 중…' : actionLabel}</Text>
            </Pressable>
            <Text style={styles.mouseHint}>마우스 사용 시 적용돼요.</Text>
          </View>
          {SHOP_ITEMS.map((item) => (
            <View key={item.name} style={styles.itemCard}>
              <Text style={styles.itemIcon}>{item.icon}</Text>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemDesc}>{item.desc}</Text>
              <Text style={styles.priceText}>🪙 {item.price}</Text>
            </View>
          ))}

          <View style={styles.itemCard}>
            <View style={styles.comingSoonContainer}>
              <Text style={styles.comingSoonText}>coming{'\n'}soon{'\n'}...</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 60, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  coinText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  scroll: { flex: 1, marginBottom: 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  itemCard: {
    backgroundColor: '#b2bec3',
    width: '48%',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  itemIcon: { fontSize: 50, marginBottom: 15 },
  itemName: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#000' },
  itemDesc: { fontSize: 10, color: '#2d3436', textAlign: 'center', marginBottom: 20, minHeight: 30 },
  priceText: { fontWeight: 'bold', fontSize: 16, color: '#000' },
  ufoCard: { backgroundColor: '#C4F4E6', borderColor: '#70FFE0', borderWidth: 1 },
  ufoBadge: { alignSelf: 'flex-start', backgroundColor: '#174B43', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 18 },
  ufoBadgeText: { color: '#C4F4E6', fontSize: 10, fontWeight: '700' },
  previewRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 18 },
  preview: { alignItems: 'center', gap: 6 },
  previewLabel: { color: '#24574E', fontSize: 9 },
  actionButton: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#174B43', borderRadius: 8, padding: 8, marginTop: 14 },
  actionText: { color: '#EDFFF9', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  disabledButton: { opacity: 0.45 },
  pressedButton: { opacity: 0.75 },
  mouseHint: { marginTop: 10, color: '#24574E', fontSize: 9, textAlign: 'center' },
  notice: { padding: 12, borderRadius: 10, backgroundColor: '#242A30', marginBottom: 16, gap: 8 },
  noticeText: { color: '#F4D4A6', fontSize: 12, lineHeight: 18 },
  retryButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  retryText: { color: '#70FFE0', fontWeight: '700', fontSize: 12 },
  feedback: { color: '#B7F8E4', fontSize: 13, lineHeight: 20, marginBottom: 16 },

  comingSoonContainer: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', width: '100%', minHeight: 140 },
  comingSoonText: { fontSize: 12, color: '#2d3436', textAlign: 'left' },
});
