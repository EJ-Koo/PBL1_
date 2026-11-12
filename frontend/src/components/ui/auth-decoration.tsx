import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function AuthPanelFrame() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 360 268" preserveAspectRatio="none">
      <Path d="M18 7H275L282 3H339L356 20V248L339 265H22L5 248V21Z" fill="#10121b" fillOpacity={0.8} stroke="#a1a4af" strokeWidth={1} />
      <Path d="M0 16V0H17 M343 0H360V16 M0 252V268H17 M343 268H360V252" fill="none" stroke="#e1e1e8" strokeWidth={1.2} />
      <Path d="M26 10H273 M25 261H337" stroke="#393e4d" strokeWidth={0.8} />
    </Svg>
  </View>;
}

export function AuthFieldFrame({ primary = false }: { primary?: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 316 48" preserveAspectRatio="none">
      <Defs><LinearGradient id={primary ? 'auth-primary' : 'auth-field'} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={primary ? '#fafbff' : '#242632'} /><Stop offset="1" stopColor={primary ? '#c4c7d1' : '#11131c'} />
      </LinearGradient></Defs>
      <Path d="M10 1H307L315 9V38L306 47H1V11Z" fill={primary ? 'url(#auth-primary)' : 'url(#auth-field)'} fillOpacity={primary ? 1 : 0.8}
        stroke={primary ? '#dadce6' : '#838794'} strokeWidth={1} />
      {primary ? <Path d="M10 6L15 1M17 6L22 1M24 6L29 1M31 6L36 1M38 6L43 1" stroke="#171923" strokeWidth={2} />
        : <Path d="M6 18V12L13 5 M300 5H307L311 10 M4 39V43H13" fill="none" stroke="#b5b9c5" strokeWidth={0.7} />}
    </Svg>
  </View>;
}

export function AuthLogoFrame() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 300 66" preserveAspectRatio="none">
      <Path d="M1 14V1H299V14 M1 52V65H147L164 43H299V51" fill="none" stroke="#c1c3cb" strokeWidth={1} />
      <Path d="M193 37L205 23H211L199 37Z M204 37L216 23H222L210 37Z M215 37L227 23H233L221 37Z M226 37L238 23H244L232 37Z M237 37L249 23H298V37Z" fill="#d5d6de" />
    </Svg>
  </View>;
}

export function AuthScreenChrome() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 1440 960" preserveAspectRatio="none">
      <Path d="M48 90V48H90 M1350 48H1392V90" fill="none" stroke="#b9bbc5" strokeWidth={1.4} />
      <Path d="M48 888H567L588 870H852L873 888H1392 M48 909H1392 M592 881H637V902H575Z M646 881H794V902H646Z M803 881H848L866 902H803Z" fill="none" stroke="#a5a8b5" strokeWidth={1} />
      <Path d="M51 904L66 891M66 904L81 891M81 904L96 891M96 904L111 891M111 904L126 891M126 904L141 891 M1299 891L1314 904M1314 891L1329 904M1329 891L1344 904M1344 891L1359 904M1359 891L1374 904M1374 891L1389 904" stroke="#c7c9d2" strokeWidth={4} />
    </Svg>
  </View>;
}

export function AuthIcon({ kind }: { kind: 'email' | 'lock' | 'eye' | 'eye-off' }) {
  return <View style={{ position: 'relative', zIndex: 1, width: 20, height: 20, flexShrink: 0 }}>
    <Svg width={20} height={20} viewBox="0 0 24 24" pointerEvents="none">
    {kind === 'email' ? <Path d="M3 5H21V19H3Z M3 6L12 13L21 6 M3 19L9 12 M21 19L15 12" fill="none" stroke="#c0c4cf" strokeWidth={1.2} />
      : kind === 'lock' ? <Path d="M6 10H18V21H6Z M8 10V6A4 4 0 0 1 16 6V10 M12 14V17" fill="none" stroke="#c0c4cf" strokeWidth={1.3} />
        : <><Path d="M2 12Q12 1 22 12Q12 23 2 12Z M9 12A3 3 0 1 0 15 12A3 3 0 1 0 9 12" fill="none" stroke="#b7bdca" strokeWidth={1.2} />
          {kind === 'eye-off' && <Path d="M3 3L21 21" stroke="#b7bdca" strokeWidth={1.5} />}</>}
  </Svg>
  </View>;
}
