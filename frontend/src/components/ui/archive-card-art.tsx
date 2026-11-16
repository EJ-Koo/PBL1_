import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const backgrounds = [
  require('../../../assets/images/archive/quarter-1.png'),
  require('../../../assets/images/archive/quarter-2.png'),
  require('../../../assets/images/archive/quarter-3.png'),
  require('../../../assets/images/archive/quarter-4.png'),
];

export function ArchiveCardArt({ index, locked }: { index: number; locked: boolean }) {
  const id = `archive-${index}`;
  const frame = 'M11 1H389L399 11V109L389 119H11L1 109V11Z';
  return <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none" pointerEvents="none">
    <Defs>
      <ClipPath id={id+'c'}><Path d={frame}/></ClipPath>
      <LinearGradient id={id+'s'}>
        <Stop offset="0" stopColor="#060709" stopOpacity="0.35"/>
        <Stop offset="0.55" stopColor="#060709" stopOpacity="0.12"/>
        <Stop offset="1" stopColor="#060709" stopOpacity="0"/>
      </LinearGradient>
    </Defs>
    <G clipPath={`url(#${id}c)`}>
      <Rect width="400" height="120" fill={locked ? '#34353a' : '#08090f'}/>
      {!locked && <>
        <SvgImage href={backgrounds[index % backgrounds.length]} width="400" height="120" preserveAspectRatio="xMidYMid slice"/>
        <Rect width="400" height="120" fill={`url(#${id}s)`}/>
      </>}
      <Path d="M244 119L280 84H399V119Z" fill="#10121d" fillOpacity="0.55" stroke="#9397a3" strokeWidth="0.7"/>
    </G>
    <Path d={frame} fill="none" stroke="#989ba6" strokeWidth="0.9"/>
    <Path d="M21 7L27 1 M28 7L34 1 M35 7L41 1 M42 7L48 1" stroke="#ddd" strokeWidth="2"/>
    {!locked && <Path d="M382 94L388 101L382 108" fill="none" stroke="#ddd" strokeWidth="1.5"/>}
  </Svg>;
}
