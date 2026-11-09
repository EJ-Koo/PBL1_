// [ADDED 2026-11-07] 상점 화면 (fffju 상점 디자인 + 서버 코인·구매·장착).
//  - 소모품(프리즘): 여러 번 구매, 보유 개수 표시
//  - 장착 아이템(배경·혜성): 한 번 구매 후 장착/해제. 같은 칸(배경)은 하나만 장착
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { showMessage } from '@/lib/feedback';
import { confirmChoice } from '@/lib/notice';
import type { ShopItem } from '@/lib/shop-api';
import { useShop } from '@/store/shop-context';

function actionFor(item: ShopItem, coins: number) {
  const owned = item.quantity > 0;
  if (item.kind === 'equip' && owned) {
    return item.equipped
      ? { label: '해제', kind: 'unequip' as const, disabled: false }
      : { label: '장착', kind: 'equip' as const, disabled: false };
  }
  if (!item.on_sale) return { label: '판매 종료', kind: 'none' as const, disabled: true };
  if (coins < item.price) return { label: '코인 부족', kind: 'none' as const, disabled: true };
  return { label: '구매', kind: 'buy' as const, disabled: false };
}

// [MODIFIED 2026-11-09] 뒤로가기, 버튼 높이 고정(보유 중 표시), 테스트용 초기화 버튼
export function ShopScreen({ onBack }: { onBack: () => void }) {
  const { coins, items, loading, error, refresh, purchase, setEquipped, resetAllowed, resetShop } = useShop();
  const [busyId, setBusyId] = useState<string | null>(null);
  const balance = coins ?? 0;

  const run = async (item: ShopItem, kind: 'buy' | 'equip' | 'unequip') => {
    setBusyId(item.id);
    const result =
      kind === 'buy' ? await purchase(item.id) : await setEquipped(item.id, kind === 'equip');
    setBusyId(null);
    if (!result.ok) showMessage('실패', result.error);
  };

  const onPress = (item: ShopItem) => {
    const action = actionFor(item, balance);
    if (action.disabled || action.kind === 'none' || busyId) return;
    if (action.kind === 'buy') {
      confirmChoice('구매', `${item.icon} ${item.name}을(를) 🪙 ${item.price}에 살까요?`, '구매', () => run(item, 'buy'));
      return;
    }
    run(item, action.kind);
  };

  const onReset = () => {
    if (busyId) return;
    confirmChoice(
      '내 상점 초기화 (테스트용)',
      '코인이 시작 코인으로 돌아가고, 산 아이템과 코인 기록이 모두 지워집니다.',
      '초기화',
      async () => {
        setBusyId('__reset__');
        const result = await resetShop();
        setBusyId(null);
        if (!result.ok) showMessage('실패', result.error);
      }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={onBack} style={styles.back} accessibilityLabel="뒤로가기" testID="shop-back" hitSlop={10}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🛍️ 상점</Text>
        </View>
        <View style={styles.coinPill} testID="shop-coins">
          <Text style={styles.coinText}>🪙 {coins ?? '…'}</Text>
        </View>
      </View>

      {error ? (
        <TouchableOpacity style={styles.errorBox} onPress={refresh}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorRetry}>눌러서 다시 시도</Text>
        </TouchableOpacity>
      ) : null}

      {loading && items.length === 0 ? <ActivityIndicator color="#fff" style={styles.loading} /> : null}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {items.map((item) => {
            const action = actionFor(item, balance);
            const owned = item.quantity > 0;
            return (
              <View key={item.id} style={[styles.card, item.equipped && styles.cardEquipped]} testID={`shop-item-${item.id}`}>
                {item.equipped ? <Text style={styles.badge}>장착 중</Text> : null}
                {item.kind === 'consumable' && owned ? <Text style={styles.badge}>보유 {item.quantity}개</Text> : null}
                <Text style={styles.icon}>{item.icon}</Text>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.desc}>{item.description}</Text>
                {/* 가격 줄은 항상 같은 높이로 둔다 → 구매 후에도 버튼 위치가 그대로 */}
                <Text style={styles.price}>{item.kind === 'equip' && owned ? '보유 중' : `🪙 ${item.price}`}</Text>
                <TouchableOpacity
                  testID={`shop-action-${item.id}`}
                  accessibilityLabel={`${item.name} ${action.label}`}
                  disabled={action.disabled || busyId !== null}
                  onPress={() => onPress(item)}
                  style={[
                    styles.button,
                    action.kind === 'unequip' && styles.buttonGhost,
                    action.disabled && styles.buttonDisabled,
                  ]}>
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={[styles.buttonText, action.disabled && styles.buttonTextDisabled]}>{action.label}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { paddingRight: 4, paddingVertical: 2 },
  backText: { color: '#fff', fontSize: 34, lineHeight: 34, fontWeight: '300' },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  coinPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  coinText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  errorBox: { backgroundColor: '#3A1F2E', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: '#F66C9E', fontSize: 13 },
  errorRetry: { color: '#fff', fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  loading: { marginTop: 20 },
  scroll: { flex: 1, marginBottom: 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    backgroundColor: '#b2bec3',
    width: '48%',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardEquipped: { borderColor: '#FED240' },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
    backgroundColor: '#FED240',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  icon: { fontSize: 50, marginBottom: 15, marginTop: 6 },
  name: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#000' },
  desc: { fontSize: 10, color: '#2d3436', textAlign: 'center', marginBottom: 14, minHeight: 30 },
  price: { fontWeight: 'bold', fontSize: 16, lineHeight: 22, color: '#000', marginBottom: 10 },
  reset: {
    marginTop: 10,
    marginBottom: 20,
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
  button: {
    backgroundColor: '#FED240',
    borderRadius: 8,
    paddingVertical: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  buttonGhost: { backgroundColor: '#dfe6e9' },
  buttonDisabled: { backgroundColor: '#95a5a6' },
  buttonText: { fontWeight: 'bold', fontSize: 14, color: '#000' },
  buttonTextDisabled: { color: '#555' },
});
