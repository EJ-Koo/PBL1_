// front 브랜치 frontend/src/app/index.jsx의 'shop' 화면을 그대로 이식.
// 아직 실제 재화/구매 연동 없음 — 하드코딩된 더미 데이터 그대로.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const SHOP_ITEMS = [
  { icon: '❄️', name: '프리즘', desc: '연속 출석 멈춤을 1회 방어할 수 있다.', price: 30 },
  { icon: '🌌', name: '배경 (blue)', desc: '나의 우주 배경을 바꿀 수 있다.', price: 50 },
  { icon: '☄️', name: '혜성', desc: '5초마다 나의 우주에 혜성이 떨어진다.', price: 30 },
  { icon: '🌃', name: '배경 (black)', desc: '나의 우주 배경을 바꿀 수 있다.', price: 50 },
];

export function ShopScreen({ onClose }: { onClose?: () => void } = {}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛍️ 상점</Text>
        <View style={styles.headerRight}>
          <View style={styles.coinPill}>
            <Text style={styles.coinText}>🪙 999</Text>
          </View>
          {onClose && (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
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

  comingSoonContainer: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', width: '100%', minHeight: 140 },
  comingSoonText: { fontSize: 12, color: '#2d3436', textAlign: 'left' },
});
