import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { DesignPaint } from '@/constants/ui-design';

type Props = {
  scale: number; label: string; value: number; min?: number; max?: number; disabled?: boolean;
  onPreview: (value: number) => void; onChange: (value: number) => void;
};

export function MenuSlider({ scale, label, value, min = 0, max = 100, disabled = false, onPreview, onChange }: Props) {
  const latest = useRef(value);
  const start = useRef({ x: 0, y: 0, left: 0 });
  const width = useRef(118 * scale);
  const [trackWidth, setTrackWidth] = useState(118 * scale);
  const dragging = useRef(false);
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const fromX = (x: number) => clamp(Math.round(min + (x - 6 * scale) / Math.max(1, width.current - 12 * scale) * (max - min)));
  const preview = (pageX: number) => {
    if (disabled) return;
    const next = fromX(pageX - start.current.left);
    if (!Number.isFinite(next)) return;
    latest.current = next;
    onPreview(latest.current);
  };
  const horizontalDrag = (event: GestureResponderEvent) => {
    const dx = Math.abs(event.nativeEvent.pageX - start.current.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.current.y);
    return dx > 4 && dx > dy;
  };
  // [FIXED 2026-11-10] 웹에서 그냥 클릭하면 위치값(locationX)이 비어 NaN 이 들어가던 문제:
  // 숫자가 아닌 값은 무시하고, 화면에 그릴 때도 범위 안의 숫자로만 그린다.
  const adjust = (next: number) => {
    if (disabled || !Number.isFinite(next)) return;
    const result = clamp(next);
    onPreview(result);
    onChange(result);
  };
  const safeValue = Number.isFinite(value) ? clamp(value) : min;
  const thumb = 6 * scale + Math.max(0, trackWidth - 12 * scale) * (safeValue - min) / Math.max(1, max - min);
  const trackHeight = Math.max(44, 44 * scale);

  return (
    <View
      accessible focusable={!disabled} accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: safeValue, text: `${safeValue}%` }}
      accessibilityActions={[{ name: 'increment', label: '높이기' }, { name: 'decrement', label: '낮추기' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') adjust(value + 5);
        else if (event.nativeEvent.actionName === 'decrement') adjust(value - 5);
      }}
      onLayout={(event) => { width.current = event.nativeEvent.layout.width; setTrackWidth(width.current); }}
      onStartShouldSetResponderCapture={(event) => {
        if (disabled) return false;
        const { pageX, pageY, locationX } = event.nativeEvent;
        start.current = { x: pageX, y: pageY, left: pageX - locationX };
        dragging.current = false;
        return false;
      }}
      onMoveShouldSetResponderCapture={(event) => !disabled && horizontalDrag(event)}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => { dragging.current = true; preview(event.nativeEvent.pageX); }}
      onResponderMove={(event) => preview(event.nativeEvent.pageX)}
      onResponderRelease={() => { onChange(latest.current); }}
      onResponderTerminate={() => { onChange(latest.current); }}
      {...{ onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        adjust(event.key === 'Home' ? min : event.key === 'End' ? max
          : value + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 5 : -5));
      } }}
      style={{ flex: 1, minWidth: 20 * scale, height: trackHeight }}>
      <Pressable accessible={false} focusable={false} disabled={disabled} style={StyleSheet.absoluteFill}
        onPress={(event) => {
          if (dragging.current) return;
          // 웹 클릭 이벤트에는 locationX 가 없을 수 있어, 누를 때 기록한 슬라이더 왼쪽 끝(start.left)으로 계산한다.
          const { locationX, pageX } = event.nativeEvent;
          adjust(fromX(Number.isFinite(locationX) ? locationX : pageX - start.current.left));
        }}>
        <Svg width="100%" height={trackHeight} viewBox={`0 0 ${trackWidth} ${trackHeight}`} pointerEvents="none" accessible={false}>
          <Path d={`M${6 * scale} ${trackHeight / 2}H${Math.max(6 * scale, trackWidth - 6 * scale)}`} stroke="#4b4b4b" strokeWidth={4 * scale} />
          <Path d={`M${6 * scale} ${trackHeight / 2}H${thumb}`} stroke={DesignPaint.ink} strokeWidth={4 * scale} />
          <Circle cx={thumb} cy={trackHeight / 2} r={6.5 * scale} fill={DesignPaint.ink} />
        </Svg>
      </Pressable>
    </View>
  );
}
