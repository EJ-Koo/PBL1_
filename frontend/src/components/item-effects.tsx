// [ADDED 2026-11-07] 장착한 아이템의 효과를 나의 우주에 그린다.
//  - background : 배경 위에 색을 덧씌운다 (tint, opacity)
//  - comet      : interval_sec 마다 혜성이 대각선으로 떨어진다
// 효과 값은 서버 items.effect 에서 오므로, 관리자 화면에서 색·주기를 바꾸면 그대로 반영된다.
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import type { ItemEffect } from '@/lib/shop-api';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 배경 색 덧씌우기. 별(3D 화면)보다 아래에 깔아야 별 색이 바뀌지 않는다. */
export function BackgroundTint({ effects }: { effects: ItemEffect[] }) {
  const bg = effects.find((e) => e.type === 'background' && typeof e.tint === 'string');
  if (!bg) return null;
  const opacity = clamp(typeof bg.opacity === 'number' ? bg.opacity : 0.5, 0, 1);
  return (
    <View
      testID="background-tint"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: bg.tint as string, opacity }]}
    />
  );
}

/** 혜성. 화면을 가리지 않도록 터치는 통과시킨다. */
export function CometLayer({ effects }: { effects: ItemEffect[] }) {
  const comet = effects.find((e) => e.type === 'comet');
  const intervalSec = clamp(typeof comet?.interval_sec === 'number' ? comet.interval_sec : 5, 1, 600);
  const [progress] = useState(() => new Animated.Value(0));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [start, setStart] = useState({ x: 0.7, y: 0.1 });

  useEffect(() => {
    if (!comet || size.width === 0) return;
    let alive = true;
    const fire = () => {
      if (!alive) return;
      setStart({ x: 0.45 + Math.random() * 0.5, y: Math.random() * 0.35 });
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 1750,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    };
    fire();
    const timer = setInterval(fire, intervalSec * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      progress.stopAnimation();
    };
  }, [comet, intervalSec, size.width, progress]);

  if (!comet) return null;

  const travel = Math.max(size.width, size.height) * 0.55;
  const left = start.x * size.width;
  const top = start.y * size.height;

  return (
    <View
      testID="comet-layer"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Animated.View
        style={[
          styles.comet,
          {
            left,
            top,
            opacity: progress.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 0.8, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel * 0.6] }) },
              { rotate: '-31deg' },
            ],
          },
        ]}>
        <View style={styles.head} />
        <View style={styles.tail} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  comet: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  head: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#BFE3FF',
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  tail: { width: 90, height: 2, borderRadius: 1, backgroundColor: 'rgba(191,227,255,0.55)' },
});
