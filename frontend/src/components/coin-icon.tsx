import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/** Shared vector coin: silver rim, warm gold face and a four-point navigation star. */
export function CoinIcon({ size = 24 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return <Svg width={size} height={size} viewBox="0 0 40 40" pointerEvents="none" aria-hidden>
    <Defs>
      <LinearGradient id={`rim-${id}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#fffdf1" /><Stop offset="0.45" stopColor="#bdc6d9" /><Stop offset="1" stopColor="#7d8ca8" />
      </LinearGradient>
      <LinearGradient id={`gold-${id}`} x1="0" y1="0" x2="0.85" y2="1">
        <Stop offset="0" stopColor="#ffedb4" /><Stop offset="0.5" stopColor="#d9b96d" /><Stop offset="1" stopColor="#8c6735" />
      </LinearGradient>
    </Defs>
    <Circle cx="20" cy="21" r="18" fill="#090e1b" opacity="0.5" />
    <Circle cx="20" cy="19" r="17.5" fill={`url(#rim-${id})`} />
    <Circle cx="20" cy="19" r="14.4" fill={`url(#gold-${id})`} stroke="#6f5838" strokeWidth="0.8" />
    <Circle cx="20" cy="19" r="11.6" fill="none" stroke="#fff3c2" strokeWidth="0.65" opacity="0.6" />
    <Path d="M20 8.5L23.2 15.8L30.5 19L23.2 22.2L20 29.5L16.8 22.2L9.5 19L16.8 15.8Z" fill="#fff6d9" stroke="#866331" strokeWidth="0.65" />
    <Path d="M20 11V27M12 19H28" stroke="#c5a361" strokeWidth="0.65" />
    <Path d="M8 11A15 15 0 0 1 17 4.5" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
  </Svg>;
}
