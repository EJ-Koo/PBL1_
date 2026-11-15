import { useId } from 'react';
import { Pressable, StyleSheet, Text as NativeText, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function SpaceDialogFrame({ footer = false }: { footer?: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 520 300" preserveAspectRatio="none">
      <Path d="M20 1H500L519 20V280L500 299H20L1 280V20Z" fill="#0c0e14" fillOpacity={0.85} stroke="#cfd1d9" strokeWidth={1.2} />
      <Path d="M30 18H354L370 34H490 M30 282H120L136 291H480" fill="none" stroke="#a8acb7" strokeWidth={0.8} />
      {footer && <Path d="M50 289L59 280H67L58 289Z M66 289L75 280H83L74 289Z M82 289L91 280H99L90 289Z" fill="#d7d9e0" />}
    </Svg>
  </View>;
}

export function AngularButton({ label, primary = false, disabled = false, onPress, style }: {
  label: string; primary?: boolean; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }, style]}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none"><Svg width="100%" height="100%" viewBox="0 0 180 48" preserveAspectRatio="none">
      <Defs><LinearGradient id={`dialog-${id}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#fff" /><Stop offset="1" stopColor="#bfc2cc" /></LinearGradient></Defs>
      <Path d="M14 1H173L179 8V34L165 47H1V15Z" fill={primary ? `url(#dialog-${id})` : '#101219'} stroke="#e5e6ed" strokeWidth={1} />
    </Svg></View>
    <NativeText style={{ color: primary ? '#11141b' : '#f1f2f7', fontSize: 16, fontWeight: primary ? '700' : '400' }}>{label}{primary ? '   »' : ''}</NativeText>
  </Pressable>;
}
