import { useLanguage } from '@/lib/language';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

import { BottomNavFrame } from './design-decoration';

type Props = {
  activeScreen: string;
  onDiary: () => void;
  onHome: () => void;
  onGroup: () => void;
  highlight?: 'diary' | 'home' | 'group';
};

export function UniverseBottomNav({ activeScreen, onDiary, onHome, onGroup, highlight }: Props) {
  const { t } = useLanguage();
  const { navLeft, navWidth, navBottom, navLayout } = useResponsiveLayout();
  const [pressed, setPressed] = useState<string | null>(null);
  const actions = { diary: onDiary, home: onHome, group: onGroup };
  if (navWidth <= 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { left: navLeft, width: navWidth, height: navLayout.height + navBottom }]}>
      <BottomNavFrame layout={navLayout} pressed={pressed} highlighted={highlight} />
      {navLayout.items.map(item => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={t(item.label)}
          aria-current={activeScreen === item.id ? 'page' : undefined}
          accessibilityState={{ selected: activeScreen === item.id }} onPress={actions[item.id]}
          onPressIn={() => setPressed(item.id)} onPressOut={() => setPressed(null)}
          style={{ position: 'absolute', left: item.hitLeft, top: navLayout.hitTop,
            width: item.hitWidth, height: navLayout.hitHeight }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, zIndex: 20, backgroundColor: '#000' },
});
