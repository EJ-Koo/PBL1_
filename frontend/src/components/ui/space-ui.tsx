import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';

export function SpaceSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.surface, style]}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, index) => <View key={index} style={[styles.corner, corner]} />)}
      </View>
    </View>
  );
}

export function SpaceButton({ label, onPress, disabled = false, primary = false, scale = 1, style, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; scale?: number;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, { minHeight: Math.max(44, 44 * scale), paddingVertical: 8 * scale, paddingHorizontal: 14 * scale, borderRadius: 22 * scale,
        backgroundColor: primary ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)', opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }, style]}>
      <Text style={{ color: primary ? '#080b11' : DesignPaint.ink, fontFamily: DesignFonts.bold, fontSize: 14 * scale, lineHeight: 21 * scale, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function SpaceIcon({ kind, size = 28, color = '#fff' }: { kind: 'star' | 'group' | 'prism' | 'blue' | 'black' | 'comet' | 'coin' | 'check'; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" pointerEvents="none">
      {kind === 'star' ? <Path d="M24 4L30 17L44 19L34 29L37 43L24 36L11 43L14 29L4 19L18 17Z" fill={color} />
        : kind === 'check' ? <Path d="M10 24L20 34L39 14" fill="none" stroke={color} strokeWidth={3} />
        : kind === 'coin' ? <><Circle cx={24} cy={24} r={18} fill="none" stroke={color} strokeWidth={1.5} /><Circle cx={24} cy={24} r={13} fill="none" stroke={color} strokeWidth={0.8} /><Path d="M24 14V34M30 18H21A4 4 0 0 0 21 25H27A4 4 0 0 1 27 32H18" fill="none" stroke={color} strokeWidth={1.5} /></>
        : kind === 'prism' ? <><Path d="M24 5L42 37H6Z M24 5V37 M6 37L24 25L42 37" fill="none" stroke={color} strokeWidth={1.5} /></>
        : kind === 'comet' ? <><Path d="M16 27L38 5 M21 32L44 9 M10 24L26 8" stroke={color} strokeWidth={1.5} /><Circle cx={13} cy={34} r={8} fill="none" stroke={color} strokeWidth={1.5} /><Circle cx={13} cy={34} r={3} fill={color} /></>
        : kind === 'group' ? <><Circle cx={24} cy={24} r={18} fill="none" stroke={color} strokeWidth={0.7} /><Path d="M12 16L30 10L36 30L17 37Z M12 16L36 30 M30 10L17 37" stroke={color} strokeWidth={1} />{[[12,16],[30,10],[36,30],[17,37]].map(([x,y]) => <Circle key={x} cx={x} cy={y} r={3} fill={color} />)}</>
        : <><Circle cx={24} cy={24} r={15} fill={kind === 'blue' ? '#406ba155' : '#000'} stroke={color} strokeWidth={1} /><Path d="M5 31C8 14 33 10 43 17C53 28 19 39 5 31Z" fill="none" stroke={color} strokeWidth={0.8} /><Circle cx={34} cy={8} r={1.8} fill={color} /><Circle cx={10} cy={10} r={1} fill={color} /></>}
    </Svg>
  );
}

const styles = StyleSheet.create({
  surface: { backgroundColor: 'rgba(12,16,24,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  corner: { position: 'absolute', width: 13, height: 13, borderColor: '#fff' },
  topLeft: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  topRight: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bottomLeft: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  bottomRight: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  button: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', justifyContent: 'center', alignItems: 'center' },
});
