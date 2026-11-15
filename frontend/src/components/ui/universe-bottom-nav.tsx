import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { getBottomNavLayout } from '@/lib/responsive-layout';

import { BottomNavFrame } from './design-decoration';

type Props = {
  scale: number;
  activeScreen: string;
  onDiary: () => void;
  onHome: () => void;
  onGroup: () => void;
};

export function UniverseBottomNav({ scale, activeScreen, onDiary, onHome, onGroup }: Props) {
  const { navLeft, navWidth, navBottom, navHeight } = useResponsiveLayout();
  const { items } = getBottomNavLayout(scale > 0 ? navWidth / scale : 393);
  const actions = [onDiary, onHome, onGroup];
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { left: navLeft, bottom: navBottom, width: navWidth, height: navHeight }]}>
      <BottomNavFrame scale={scale} width={navWidth} />
      {items.map((item, index) => (
        <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={item.label}
          accessibilityState={{ selected: activeScreen === item.id }} onPress={actions[index]} hitSlop={{ left: 2, right: 2 }}
          style={[styles.button, { left: item.x * scale, top: Math.max(0, item.y * scale - Math.max(0, 44 - item.height * scale) / 2),
            width: item.width * scale, height: Math.max(44, item.height * scale), borderWidth: 1, borderColor: '#dfe2e9', backgroundColor: activeScreen === item.id ? '#474a52' : '#0a0b0e' }]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
            style={{ color: '#f1f2f6', fontSize: 12 * scale, width: '100%', textAlign: 'center', fontWeight: activeScreen === item.id ? '700' : '400' }}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 20 },
  button: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
