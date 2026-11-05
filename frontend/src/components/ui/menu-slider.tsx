import { useRef } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { DesignColors, DesignPaint } from '@/constants/ui-design';

type Props = {
  scale: number; label: string; value: number; min?: number; max?: number;
  onPreview: (value: number) => void; onChange: (value: number) => void;
};

export function MenuSlider({ scale, label, value, min = 0, max = 100, onPreview, onChange }: Props) {
  const latest = useRef(value);
  const start = useRef({ x: 0, y: 0, left: 0 });
  const width = useRef(118 * scale);
  const dragging = useRef(false);
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const fromX = (x: number) => clamp(Math.round(min + (x - 6 * scale) / Math.max(1, width.current - 12 * scale) * (max - min)));
  const preview = (pageX: number) => {
    latest.current = fromX(pageX - start.current.left);
    onPreview(latest.current);
  };
  const horizontalDrag = (event: GestureResponderEvent) => {
    const dx = Math.abs(event.nativeEvent.pageX - start.current.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.current.y);
    return dx > 4 && dx > dy;
  };
  const adjust = (next: number) => { const result = clamp(next); onPreview(result); onChange(result); };
  const thumb = 6 + 106 * (value - min) / (max - min);

  return (
    <View
      accessible focusable accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment', label: '높이기' }, { name: 'decrement', label: '낮추기' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') adjust(value + 5);
        else if (event.nativeEvent.actionName === 'decrement') adjust(value - 5);
      }}
      onLayout={(event) => { width.current = event.nativeEvent.layout.width; }}
      onStartShouldSetResponderCapture={(event) => {
        const { pageX, pageY, locationX } = event.nativeEvent;
        start.current = { x: pageX, y: pageY, left: pageX - locationX };
        dragging.current = false;
        return false;
      }}
      onMoveShouldSetResponderCapture={horizontalDrag}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => { dragging.current = true; preview(event.nativeEvent.pageX); }}
      onResponderMove={(event) => preview(event.nativeEvent.pageX)}
      onResponderRelease={() => { onChange(latest.current); }}
      onResponderTerminate={() => { onChange(latest.current); }}
      {...{ onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        adjust(event.key === 'Home' ? min : event.key === 'End' ? max
          : value + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 5 : -5));
      } }}
      style={{ flex: 1, height: 34 * scale }}>
      <Pressable accessible={false} focusable={false} style={StyleSheet.absoluteFill}
        onPress={(event) => { if (!dragging.current) adjust(fromX(event.nativeEvent.locationX)); }}>
        <Svg width="100%" height={34 * scale} viewBox="0 0 118 34" preserveAspectRatio="none" pointerEvents="none">
          <Path d="M6 17H112" stroke={DesignColors.black} strokeWidth={3} />
          <Path d="M6 17H112" stroke={DesignPaint.menuSliderTrack} strokeWidth={3} />
          <Path d={`M6 17H${thumb}`} stroke={DesignPaint.ink} strokeWidth={3} />
          <Circle cx={thumb} cy={17} r={5} fill={DesignPaint.ink} />
        </Svg>
      </Pressable>
    </View>
  );
}
