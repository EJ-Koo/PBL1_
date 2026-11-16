import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
export function ArchiveCardArt({ index, locked }: { index: number; locked: boolean }) {
  const color = ['#a1b5ff', '#d8adc9', '#9caef1', '#e4d5b2'][index % 4];
  const id = `archive-${index}`;
  const frame = 'M11 1H389L399 11V109L389 119H11L1 109V11Z';
  return <Svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none" pointerEvents="none">
    <Defs>
      <ClipPath id={id+'c'}><Path d={frame}/></ClipPath>
      <RadialGradient id={id+'h'}><Stop offset="0" stopColor={color} stopOpacity="0.45"/><Stop offset="1" stopColor={color} stopOpacity="0"/></RadialGradient>
      <RadialGradient id={id+'p'} cx="45%" cy="8%" r="90%"><Stop offset="0" stopColor={color}/><Stop offset="0.12" stopColor={color} stopOpacity="0.5"/><Stop offset="0.48" stopColor="#121525"/><Stop offset="1" stopColor="#050609"/></RadialGradient>
      <LinearGradient id={id+'s'}><Stop offset="0" stopColor="#060709" stopOpacity="0.95"/><Stop offset="0.55" stopColor="#060709" stopOpacity="0.45"/><Stop offset="1" stopColor="#060709" stopOpacity="0"/></LinearGradient>
    </Defs>
    <G clipPath={`url(#${id}c)`}>
      <Rect width="400" height="120" fill={locked ? '#34353a' : '#08090f'}/>
      {!locked && <>
        <Ellipse cx="305" cy="108" rx="190" ry="100" fill={`url(#${id}h)`}/>
        {Array.from({length:90},(_,i)=><Circle key={i} cx={(i*71+19)%400} cy={(i*43+7)%120} r={i%7===0?0.7:0.35} fill="#e0e2f4" opacity={0.15+i%4*0.13}/>)}
        {index%4===2 ? <G rotation="-19" origin="285, 88">
          <Ellipse cx="285" cy="88" rx="99" ry="17" fill="none" stroke={color} strokeWidth="3" opacity="0.3"/>
          <Circle cx="285" cy="75" r="47" fill={`url(#${id}p)`} stroke={color} strokeWidth="0.7"/>
          <Path d="M187 88C187 112 384 112 384 88 M199 88C199 106 371 106 371 88" fill="none" stroke={color} strokeWidth="1.5" opacity="0.65"/>
        </G> : <>
          <Ellipse cx={index%4===1?410:365} cy="242" rx="228" ry="190" fill={`url(#${id}p)`} stroke={color} strokeWidth="1"/>
          {[0,1,2,3].map(i=><Ellipse key={i} cx={index%4===1?410:365} cy="242" rx={230+i*2} ry={192+i*2} fill="none" stroke={color} opacity={0.18/(i+1)} strokeWidth="3"/>)}
          {index%4===3 && <Circle cx="327" cy="30" r="12" fill={`url(#${id}p)`} stroke="#aaa" strokeWidth="0.3"/>}
        </>}
        <Rect width="400" height="120" fill={`url(#${id}s)`}/>
        {index%4===0 && <Path d="M244 42L303 13 M278 42L323 22" stroke="#d5dcff" strokeWidth="0.7" opacity="0.7"/>}
        {index%4===1 && <Path d="M293 20V39 M285 29H301" stroke="#e9deeb" strokeWidth="0.6"/>}
      </>}
      <Path d="M244 119L280 84H399V119Z" fill="#10121d" fillOpacity="0.55" stroke="#9397a3" strokeWidth="0.7"/>
    </G>
    <Path d={frame} fill="none" stroke="#989ba6" strokeWidth="0.9"/>
    <Path d="M21 7L27 1 M28 7L34 1 M35 7L41 1 M42 7L48 1" stroke="#ddd" strokeWidth="2"/>
    {!locked && <Path d="M382 94L388 101L382 108" fill="none" stroke="#ddd" strokeWidth="1.5"/>}
  </Svg>;
}
