import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { DesignPaint } from '@/constants/ui-design';

/** A translucent, clipped panel with fixed corner cuts and notched top/bottom edges. */
export function MenuDecoration({ scale, height, width = 352 * scale }: { scale: number; height: number; width?: number }) {
  const w = width / scale;
  const h = Math.max(64, height / scale);
  const topCenter = w * 0.53;
  const bottomCenter = w / 2;
  return <Svg width={width} height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
    style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
    <Path d={`M22 1H${topCenter - 52}L${topCenter - 46} 6H${topCenter + 44}L${topCenter + 52} 1H${w - 23}L${w - 1} 23V${h - 23}L${w - 23} ${h - 1}
      H${bottomCenter + 55}L${bottomCenter + 46} ${h - 7}H${bottomCenter - 47}L${bottomCenter - 57} ${h - 1}H20L1 ${h - 21}V23Z`}
      fill={DesignPaint.menuPanel} stroke="#f4f4f4" strokeWidth={1.4} />
    <Path d={`M7 29V${h - 34} M${w - 5} 29V${h - 34}`} fill="none" stroke="#f4f4f4" strokeOpacity={0.9} strokeWidth={1.7} />
  </Svg>;
}

export function MenuSearchFrame() {
  return <Svg width="100%" height="100%" viewBox="0 0 246 48" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
    <Path d="M11 1.5H244.5V37L233 46.5H1.5V12Z" fill="#11111180" stroke={DesignPaint.ink} strokeWidth={2.5} />
  </Svg>;
}

export function MenuSearchIcon({ scale }: { scale: number }) {
  return <Svg width={23 * scale} height={23 * scale} viewBox="0 0 24 24" pointerEvents="none" accessible={false}>
    <Circle cx={9.5} cy={9.5} r={5.8} fill="none" stroke={DesignPaint.ink} strokeWidth={1.5} />
    <Path d="M14 14L20.5 20.5" stroke={DesignPaint.ink} strokeWidth={1.5} />
  </Svg>;
}

export function MenuCalendarIcon({ scale }: { scale: number }) {
  return <Svg width={29 * scale} height={29 * scale} viewBox="0 0 24 24" pointerEvents="none" accessible={false}>
    <G transform="translate(1 1)" fill="none" stroke={DesignPaint.menuText} strokeWidth={1.5}>
      <Path d="M13 20H2.5A2 2 0 0 1 .5 18V5A2 2 0 0 1 2.5 3H16.5A2 2 0 0 1 18.5 5V10 M.5 8H18.5 M5 0V5 M13.5 0V5" />
      <Circle cx={15.5} cy={16} r={3.2} />
      <Path d="M18 18.5L20.5 21" />
    </G>
  </Svg>;
}

export function MenuChevron({ scale, expanded }: { scale: number; expanded: boolean }) {
  return <Svg width={20 * scale} height={20 * scale} viewBox="0 0 20 20" pointerEvents="none" accessible={false}>
    <Path d={expanded ? 'M3 6L10 13L17 6' : 'M6 2L14 10L6 18'} fill="none" stroke={DesignPaint.menuText} strokeWidth={2} />
  </Svg>;
}

export function MenuNotificationToggle({ scale, enabled }: { scale: number; enabled: boolean }) {
  return <Svg width={48 * scale} height={30 * scale} viewBox="0 0 48 30" pointerEvents="none" accessible={false}>
    <Path d="M15 1H33A14 14 0 0 1 33 29H15A14 14 0 0 1 15 1Z" fill={DesignPaint.menuText} />
    <Circle cx={enabled ? 33 : 15} cy={15} r={10} fill="#bfbfbf" />
  </Svg>;
}
