import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { DesignPaint } from '@/constants/ui-design';

// Keep the frame fixed around the viewport while the menu content scrolls inside it.
export function MenuDecoration({ scale, height }: { scale: number; height: number }) {
  const bottom = Math.max(44, height / scale);
  return (
    <Svg width={262 * scale} height={height} viewBox={`0 0 262 ${bottom}`} pointerEvents="none">
      <Rect width={262} height={bottom} fill={DesignPaint.menuPanel} />
      <Path d={`M4 22V${bottom - 22} M258 22V${bottom - 22}`} fill="none" stroke={DesignPaint.menuFrame} strokeWidth={2} />
      <Path d={`M23 4H240 M22 ${bottom - 4}H240`} stroke={DesignPaint.ink} strokeWidth={2} />
      <Path d={`M18 3.5H3.5V20 M244 3.5H258V20 M3.5 ${bottom - 19}V${bottom - 4}H18 M244 ${bottom - 4}H258V${bottom - 19}`}
        fill="none" stroke={DesignPaint.ink} strokeWidth={4} />
    </Svg>
  );
}

export function MenuSearchIcon({ scale }: { scale: number }) {
  return (
    <Svg width={24 * scale} height={24 * scale} viewBox="0 0 24 24" pointerEvents="none">
      <Circle cx={10} cy={10} r={4.5} fill="none" stroke={DesignPaint.ink} strokeWidth={1.2} />
      <Path d="M13.5 13.5L17.5 17.5" stroke={DesignPaint.ink} strokeWidth={1.2} />
    </Svg>
  );
}

export function MenuCalendarIcon({ scale }: { scale: number }) {
  return (
    <Svg width={24 * scale} height={24 * scale} viewBox="0 0 24 24" pointerEvents="none">
      <G transform="translate(1 1)" fill="none" stroke={DesignPaint.menuText} strokeWidth={1.5}>
        <Path d="M13 20H2.5A2 2 0 0 1 .5 18V5A2 2 0 0 1 2.5 3H16.5A2 2 0 0 1 18.5 5V10 M.5 8H18.5 M5 0V5 M13.5 0V5" />
        <Circle cx={15.5} cy={16} r={3.2} />
        <Path d="M18 18.5L20.5 21" />
      </G>
    </Svg>
  );
}

export function MenuChevron({ scale, expanded }: { scale: number; expanded: boolean }) {
  return (
    <Svg width={16 * scale} height={16 * scale} viewBox="0 0 16 16" pointerEvents="none">
      <Path d={expanded ? 'M1 4L8 11L15 4' : 'M4 1L11 8L4 15'} fill="none" stroke={DesignPaint.menuText} strokeWidth={2} />
    </Svg>
  );
}

export function MenuNotificationToggle({ scale, enabled }: { scale: number; enabled: boolean }) {
  return (
    <Svg width={39 * scale} height={24 * scale} viewBox="0 0 39 24" pointerEvents="none">
      <Path d={`M12 1H27A11 11 0 0 1 27 23H12A11 11 0 0 1 12 1Z M${enabled ? 35 : 20} 12A8 8 0 1 1 ${enabled ? 19 : 4} 12A8 8 0 1 1 ${enabled ? 35 : 20} 12Z`}
        fill={DesignPaint.menuText} fillRule="evenodd" />
    </Svg>
  );
}
