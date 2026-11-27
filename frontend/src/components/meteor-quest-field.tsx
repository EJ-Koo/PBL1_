import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useLanguage } from '@/lib/language';
import type { MeteorId, MeteorQuest } from '@/lib/quest-api';

const spots = [
  { id: 1, left: '18%', top: '24%', driftX: 28, driftY: 16, duration: 3300, size: 26 },
  { id: 2, left: '63%', top: '39%', driftX: -32, driftY: 24, duration: 4600, size: 33 },
  { id: 3, left: '34%', top: '67%', driftX: 34, driftY: -18, duration: 3900, size: 29 },
] as const;

export function MeteorQuestField({ quest, busy, error, top, bottom, onHit }: {
  quest: MeteorQuest; busy: boolean; error: string | null; top: number; bottom: number;
  onHit: (meteor: MeteorId) => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) setReducedMotion(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return (
    <View pointerEvents="box-none" style={[styles.field, { top, bottom }]}>
      {error && <Text pointerEvents="none" accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {spots.filter(spot => !quest.cleared.includes(spot.id)).map(spot => (
        <DriftingMeteor key={spot.id} spot={spot} busy={busy} reducedMotion={reducedMotion} onHit={onHit} />
      ))}
    </View>
  );
}

function DriftingMeteor({ spot, busy, reducedMotion, onHit }: {
  spot: (typeof spots)[number]; busy: boolean; reducedMotion: boolean; onHit: (meteor: MeteorId) => void;
}) {
  const { t } = useLanguage();
  const drift = useRef(new Animated.Value(0)).current;
  const { id, left, top, driftX, driftY, duration, size } = spot;
  useEffect(() => {
    if (reducedMotion) {
      drift.setValue(0);
      return;
    }
    const timing = { duration, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false };
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(drift, { ...timing, toValue: 1 }),
      Animated.timing(drift, { ...timing, toValue: 0 }),
    ]));
    motion.start();
    return () => motion.stop();
  }, [drift, reducedMotion, duration]);
  return (
    <Animated.View pointerEvents="box-none" style={[styles.position, { left, top, transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, driftX] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, driftY] }) },
      { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '16deg'] }) },
    ] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t('운석 치우기')} ${id}`}
        disabled={busy} onPress={() => onHit(id)} style={({ pressed }) => [styles.meteor, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={{ fontSize: size }}>🪨</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  field: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  position: { position: 'absolute' },
  error: { color: '#fff', fontSize: 14, marginTop: 6, padding: 8, backgroundColor: '#401e24' },
  meteor: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
