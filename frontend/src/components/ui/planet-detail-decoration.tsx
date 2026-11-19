import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

export function PlanetDetailBackground() {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.background]}>
    <Image source={require('../../../assets/images/night-sky.png')} contentFit="cover"
      style={[StyleSheet.absoluteFill, styles.stars]} />
  </View>;
}

export function PlanetDetailFrame({ kind, disabled = false }: {
  kind: 'planet' | 'panel' | 'button';
  disabled?: boolean;
}) {
  const height = kind === 'planet' ? 200 : kind === 'panel' ? 94 : 44;
  const outline = kind === 'planet'
    ? 'M1 20L19 2H114L122 9H227L235 2H334L352 20V180L334 198H235L228 193H122L115 198H19L1 180Z'
    : kind === 'panel'
      ? 'M1 12L12 1H129L135 5H344L352 15V81L340 93H12L1 82Z'
      : 'M1 10L10 1H343L352 10V34L343 43H10L1 34Z';
  const stroke = disabled ? '#373746' : kind === 'planet' ? '#bdcfee' : '#c6c5d6';
  return <Svg width="100%" height="100%" viewBox={`0 0 353 ${height}`}
    preserveAspectRatio="none" pointerEvents="none" aria-hidden>
    <Path d={outline} fill={kind === 'planet' ? 'none' : disabled ? '#242434' : '#121222'} />
    {!disabled && <Path d={outline} fill="none" stroke={stroke} strokeWidth={5} opacity={0.07} />}
    <Path d={outline} fill="none" stroke={stroke} strokeWidth={1.1} />
    {kind === 'planet' && <>
      <Path d="M28 6H111 M129 12H222 M239 6H323 M348 34V168 M323 193H240 M225 190H130 M110 193H29 M5 34V167"
        fill="none" stroke="#a5afc7" strokeWidth={0.65} opacity={0.7} />
      <Path d="M1 20L19 2H49 M352 180L334 198H305" fill="none" stroke="#f2f3ff" strokeWidth={2} />
      <G stroke="#929bb0" strokeWidth={0.7} opacity={0.85}>
        {Array.from({ length: 8 }, (_, i) => <Path key={i}
          d={`M${264 + i * 7} 18l6 -6 M${21 + i * 7} 186l6 -6`} />)}
      </G>
    </>}
    {kind === 'panel' && <>
      <Path d="M15 5H127 M137 8H340 M17 89H334" fill="none" stroke="#a2a0b5" strokeWidth={0.65} opacity={0.7} />
      <Path d="M352 81L340 93" stroke="#e3e4ef" strokeWidth={2} />
    </>}
  </Svg>;
}

const styles = StyleSheet.create({
  background: { backgroundColor: '#080a16' },
  stars: { opacity: 0.3 },
});
