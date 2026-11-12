import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GroupHeaderFrame } from './group-decoration';
import { SpaceButton, SpaceIcon, SpaceSurface } from './space-ui';

import { DesignFonts } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { Settings } from '@/lib/journal';

const items = [
  { id: 'prism' as const, name: '프리즘', category: 'SPECIAL', description: '하루를 놓쳐도 이어지는 별의 기록.', price: 30, ready: false },
  { id: 'blue' as const, name: '푸른 우주', category: 'BACKGROUND', description: '깊은 푸른빛으로 나의 우주를 물들여요.', price: 50, ready: true },
  { id: 'comet' as const, name: '혜성', category: 'OBJECT', description: '5초마다 우주를 가로지르는 작은 빛.', price: 30, ready: true },
  { id: 'black' as const, name: '검은 우주', category: 'BACKGROUND', description: '고요한 어둠 속에서 별이 더 선명해져요.', price: 50, ready: true },
];
type Props = { scale: number; coins: number; purchases: string[]; theme: Settings['theme']; busy: boolean; message: string; onBuy: (id: string) => void };

export function ShopScreen({ scale, coins, purchases, theme, busy, message, onBuy }: Props) {
  const { headerTop: top, bottomSpace, contentLeft, gridLeft, gridWidth } = useResponsiveLayout();
  const gap = 12 * scale;
  const innerWidth = gridWidth - 50 * scale;
  const columns = Math.max(1, Math.min(4, Math.floor((innerWidth + gap) / (156 + gap))));
  const cardWidth = (innerWidth - gap * (columns - 1)) / columns;
  return (
    <ImageBackground source={require('../../../assets/images/night-sky.png')} style={styles.screen} resizeMode="cover">
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0008' }]} />
      <View style={{ position: 'absolute', left: contentLeft + 16 * scale, top, width: 363 * scale, height: 63 * scale }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><GroupHeaderFrame scale={scale} /></View>
        <Text style={[styles.title, { position: 'absolute', left: 18 * scale, top: 13 * scale, fontSize: 27 * scale }]}>SPACE SHOP</Text>
        <View style={{ position: 'absolute', right: 9 * scale, top: 39 * scale, flexDirection: 'row', gap: 5 * scale, alignItems: 'center' }}>
          <SpaceIcon kind="coin" size={14 * scale} /><Text accessibilityLabel={`보유 코인 ${coins}`} style={[styles.text, { fontSize: 13 * scale }]}>{coins.toLocaleString()}</Text>
        </View>
      </View>
      <ScrollView style={{ position: 'absolute', left: gridLeft, width: gridWidth, top: top + 86 * scale, bottom: bottomSpace }}
        contentContainerStyle={{ paddingHorizontal: 25 * scale, paddingBottom: 16 * scale }}>
        <Text style={[styles.muted, { fontSize: 13 * scale, marginBottom: 18 * scale }]}>나의 우주에 새로운 장면을 더해보세요.</Text>
        {!!message && <Text accessibilityRole="alert" style={[styles.text, { fontSize: 13 * scale, lineHeight: 20 * scale, marginBottom: 18 * scale }]}>{message}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {items.map((item) => {
            const owned = purchases.includes(item.id);
            const active = owned && (item.id === 'comet' || theme === item.id);
            const insufficient = !owned && coins < item.price;
            const label = !item.ready ? '준비 중' : active ? '✓ 적용 중' : owned ? '적용하기' : `${item.price} 코인 · 구매`;
            return (
              <SpaceSurface key={item.id} style={{ width: cardWidth, padding: 13 * scale, backgroundColor: 'rgba(16,21,31,0.82)' }}>
                <Text style={[styles.muted, { fontSize: 8 * scale, letterSpacing: 1.4 }]}>{item.category}</Text>
                <View style={{ height: 104 * scale, alignItems: 'center', justifyContent: 'center' }}>
                  <SpaceIcon kind={item.id} size={70 * scale} color={item.id === 'blue' ? '#a6caff' : '#fff'} />
                </View>
                <Text style={[styles.title, { fontSize: 17 * scale, marginBottom: 8 * scale }]}>{item.name}</Text>
                <Text style={[styles.muted, { fontSize: 11 * scale, lineHeight: 18 * scale, minHeight: 54 * scale, marginBottom: 12 * scale }]}>{item.description}</Text>
                <SpaceButton label={insufficient && item.ready ? '코인 부족' : label} accessibilityLabel={`${item.name}, ${label}`}
                  onPress={() => onBuy(item.id)} disabled={busy || !item.ready || active || insufficient} primary={item.ready && !active}
                  scale={scale} style={{ paddingHorizontal: 4 * scale }} />
              </SpaceSurface>
            );
          })}
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  title: { color: '#fff', fontFamily: DesignFonts.bold },
  text: { color: '#fff', fontFamily: DesignFonts.regular },
  muted: { color: '#aeb7c4', fontFamily: DesignFonts.regular },
});
