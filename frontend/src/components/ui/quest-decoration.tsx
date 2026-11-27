import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export function QuestPanelFrame({ width: w, height: h, scale: s }: { width: number; height: number; scale: number }) {
  const outline = `M${20 * s} ${s}H${126 * s}L${133 * s} ${5 * s}H${w - 93 * s}L${w - 87 * s} ${s}H${w - 14 * s}L${w - s} ${14 * s}V${h - 20 * s}L${w - 17 * s} ${h - s}H${17 * s}L${4 * s} ${h - 14 * s}L${s} ${22 * s}Z`;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} accessible={false}>
      <Path d={outline} fill="#25262c" />
      <Path d={outline} fill="none" stroke="#dce0f4" strokeOpacity={0.04} strokeWidth={10 * s} />
      <Path d={outline} fill="none" stroke="#dce0f4" strokeOpacity={0.08} strokeWidth={5 * s} />
      <Path d={outline} fill="none" stroke="#bfc2cd" strokeWidth={1.3 * s} />
      <Path d={`M${40 * s} ${5 * s}H${122 * s} M${133 * s} ${8 * s}H${w - 93 * s} M${w - 85 * s} ${4 * s}H${w - 18 * s}`}
        fill="none" stroke="#747986" strokeWidth={s} />
      <Path d={`M${4 * s} ${h - 26 * s}V${h - 14 * s}L${17 * s} ${h - 2 * s}H${31 * s} M${w - 17 * s} ${h - 2 * s}L${w - 3 * s} ${h - 19 * s}`}
        fill="none" stroke="#f0f0fa" strokeWidth={2 * s} />
      <Path d={Array.from({ length: 7 }, (_, i) => {
        const x = w - (91 - i * 9.5) * s;
        return `M${x} ${h - 9 * s}l${7 * s} ${-7 * s}`;
      }).join(' ')} stroke="#9195a2" strokeWidth={0.8 * s} />
    </Svg>
  </View>;
}

export function QuestCardFrame({ scale: s, highlighted = false, locked = false }: { scale: number; highlighted?: boolean; locked?: boolean }) {
  const [{ width: w, height: h }, setSize] = useState({ width: 0, height: 0 });
  const cut = (highlighted ? 26 : 10) * s;
  const outline = `M${cut} ${s}H${w - 11 * s}L${w - s} ${11 * s}V${h - cut}L${w - cut} ${h - s}H${12 * s}L${s} ${h - 12 * s}V${cut}Z`;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={({ nativeEvent }) => setSize(nativeEvent.layout)}>
    {w > 0 && h > 0 && <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} accessible={false}>
      <Path d={outline} fill="#25262b" />
      {highlighted ? <>
        <Path d={outline} fill="none" stroke="#e5e5f5" strokeOpacity={0.04} strokeWidth={10 * s} />
        <Path d={outline} fill="none" stroke="#e5e5f5" strokeOpacity={0.09} strokeWidth={5 * s} />
      </> : locked && <Path d={`M${w - 34 * s} ${s}H${w - 11 * s}L${w - s} ${11 * s}V${h - cut}L${w - cut} ${h - s}H${w - 34 * s}Z`} fill="#36373f" />}
      <Path d={outline} fill="none" stroke={highlighted ? '#c8cbd6' : '#727783'} strokeWidth={(highlighted ? 1.35 : 0.9) * s} />
      {highlighted && <Path d={`M${2 * s} ${36 * s}V${cut}L${cut} ${2 * s}H${62 * s}`} fill="none" stroke="#f4f4ff" strokeWidth={2.5 * s} />}
      {locked && <Path d={`M${w - 22 * s} ${h / 2 - s}v${7 * s}h${9 * s}v${-7 * s}Z M${w - 20.5 * s} ${h / 2 - s}v${-3 * s}a${3 * s} ${3 * s} 0 0 1 ${6 * s} 0v${3 * s}`}
        fill="none" stroke="#9d9da4" strokeWidth={1.2 * s} />}
    </Svg>}
  </View>;
}

export function QuestDivider({ scale, header = false }: { scale: number; header?: boolean }) {
  return <Svg width="100%" height={14 * scale} viewBox="0 0 300 14" preserveAspectRatio="none" pointerEvents="none" accessible={false}>
    {header ? <>
      <Path d="M0 12H203L213 2" fill="none" stroke="#747986" strokeWidth={0.9} />
      <Path d={Array.from({ length: 8 }, (_, i) => `M${221 + i * 9.5} 8l7 -7`).join(' ')} stroke="#828793" strokeWidth={0.8} />
    </> : <Path d="M0 5H107L115 11H182L190 5H300" fill="none" stroke="#a8aab6" strokeWidth={0.9} />}
  </Svg>;
}
