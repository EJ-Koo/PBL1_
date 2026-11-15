import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './app-text';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { QuestRewardEvent } from '@/store/quest-context';

export function QuestRewardAnimation({ event, onDone }: { event: QuestRewardEvent; onDone: (id: string) => void }) {
  const { width, height } = useWindowDimensions();
  const { headerTop, scale } = useResponsiveLayout();
  const [progress] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(true);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    let alive = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => true).then(value => {
      if (!alive) return;
      setReduced(value);
      animation = Animated.timing(progress, { toValue: 1, duration: value ? 650 : 950,
        easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web', isInteraction: false });
      animation.start(({ finished }) => { if (alive && finished) done.current(event.id); });
    });
    return () => { alive = false; animation?.stop(); };
  }, [event.id, progress]);
  const fromY = height * 0.45;
  const toY = headerTop + 27 * scale;
  return <View pointerEvents="none" style={styles.overlay}>
    <Animated.View accessibilityLiveRegion="polite" style={[styles.coin, { left: width / 2 - 42, top: fromY,
      opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
      transform: reduced ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, toY - fromY] }) },
        { scale: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.1, 0.6] }) }] }]}>
      <Text style={styles.text}>◈ +{event.amount}</Text>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 40 },
  coin: { position: 'absolute', minWidth: 84, padding: 12, borderRadius: 24, backgroundColor: '#e6e8f0', alignItems: 'center' },
  text: { color: '#171c28', fontSize: 20, fontWeight: '700' },
});
