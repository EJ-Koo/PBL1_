import { Text } from '@/components/app-text';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { getBottomNavItems } from '@/lib/responsive-layout';

import { BottomNavFrame } from './design-decoration';

type Props = {
  scale: number;
  activeScreen: string;
  onDiary: () => void;
  onHome: () => void;
  onGroup: () => void;
};

export function UniverseBottomNav({ scale, activeScreen, onDiary, onHome, onGroup }: Props) {
  const { chromeLeft, chromeWidth, navBottom, navHeight, wide } = useResponsiveLayout();
  const items = getBottomNavItems(scale > 0 ? chromeWidth / scale : 393, wide);
  const actions = [onDiary, onHome, onGroup];
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { left: chromeLeft, bottom: navBottom, width: chromeWidth, height: navHeight }]}>
      <BottomNavFrame scale={scale} width={chromeWidth} wide={wide} activeScreen={activeScreen} />
      {items.map((item, index) => (
        <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={item.label}
          accessibilityState={{ selected: activeScreen === item.id }} onPress={actions[index]}
          style={[styles.button, { left: item.x * scale, top: wide ? item.y * scale : 0,
            width: item.width * scale, height: wide ? item.height * scale : navHeight }]}>
          <Text style={{ color: DesignPaint.ink, fontFamily: activeScreen === item.id ? DesignFonts.bold : DesignFonts.regular,
            fontSize: (wide ? 14 : 10) * scale, lineHeight: 21 * scale,
            ...(wide ? {} : { position: 'absolute', top: item.y * scale }) }}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 20 },
  button: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
