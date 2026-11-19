import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const backgrounds = [
  require('../../../assets/images/archive/quarter-1.png'),
  require('../../../assets/images/archive/quarter-2.png'),
  require('../../../assets/images/archive/quarter-3.png'),
  require('../../../assets/images/archive/quarter-4.png'),
];

export function ArchiveCardArt({ index, locked }: { index: number; locked: boolean }) {
  const id = 'archive-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [{ width: w, height: h }, setSize] = useState({ width: 400, height: 120 });
  const scale = Math.min(1.3, w / 400);
  const cut = 11 * scale;
  const frame = `M${cut} 1H${w - cut}L${w - 1} ${cut}V${h - cut}L${w - cut} ${h - 1}H${cut}L1 ${h - cut}V${cut}Z`;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={({ nativeEvent }) => setSize(nativeEvent.layout)}>
    {w > 0 && h > 0 && <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} accessible={false}>
      <Defs>
        <ClipPath id={id + 'c'}><Path d={frame} /></ClipPath>
        <LinearGradient id={id + 's'}>
          <Stop offset="0" stopColor="#060709" stopOpacity="0.35" />
          <Stop offset="0.55" stopColor="#060709" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#060709" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <G clipPath={`url(#${id}c)`}>
        <Rect width={w} height={h} fill="#08090f" />
        <SvgImage href={backgrounds[index % backgrounds.length]} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
        <Rect width={w} height={h} fill={`url(#${id}s)`} />
        <Path d={`M${w * 0.61} ${h - 1}L${w * 0.7} ${h - 35 * scale}H${w - 1}V${h - 1}Z`}
          fill="#10121d" fillOpacity="0.55" stroke="#9397a3" strokeWidth={0.7 * scale} />
        {locked && <Rect width={w} height={h} fill="#000" fillOpacity={0.78} />}
      </G>
      <Path d={frame} fill="none" stroke="#989ba6" strokeOpacity={locked ? 0.25 : 1} strokeWidth={1.1 * scale} />
      <Path d={Array.from({ length: 4 }, (_, i) => `M${(21 + i * 7) * scale} ${7 * scale}l${6 * scale} ${-6 * scale}`).join(' ')}
        stroke="#ddd" strokeOpacity={locked ? 0.25 : 1} strokeWidth={2 * scale} />
      <Path d={`M${w - 18 * scale} ${h - 26 * scale}l${6 * scale} ${7 * scale}l${-6 * scale} ${7 * scale}`}
        fill="none" stroke="#ddd" strokeOpacity={locked ? 0.25 : 1} strokeWidth={1.5 * scale} />
    </Svg>}
  </View>;
}

export function ArchiveLockIcon({ size = 34 }: { size?: number }) {
  return <Svg width={size} height={size * 1.2} viewBox="0 0 32 40" pointerEvents="none" accessible={false}>
    <Path d="M7 18V11A9 9 0 0 1 25 11V18" fill="none" stroke="#a3a3a3" strokeWidth={5} />
    <Path d="M5 17H27A3 3 0 0 1 30 20V35A3 3 0 0 1 27 38H5A3 3 0 0 1 2 35V20A3 3 0 0 1 5 17Z" fill="#a3a3a3" />
    <Path d="M16 23A3 3 0 0 0 13 26V30A3 3 0 0 0 19 30V26A3 3 0 0 0 16 23Z" fill="#080808" />
  </Svg>;
}
