import Svg, { Circle, G, Path } from 'react-native-svg';

export function GroupUniverseHeaderFrame({ width, scale, titleWidth = 148 * scale, titleHeight = 24 * scale }: { width: number; scale: number; titleWidth?: number; titleHeight?: number }) {
  const w = scale > 0 ? width / scale : 393;
  const center = w / 2;
  const notch = Math.min(titleWidth / Math.max(scale, 0.01) / 2, w / 2 - 12);
  const bottom = titleHeight / Math.max(scale, 0.01) + 7;
  const height = bottom + 17;
  const stripes = Math.max(0, Math.floor((center - notch - 12) / 9));
  return <Svg width={width} height={height * scale} viewBox={`0 0 ${w} ${height}`} pointerEvents="none">
    <Path d={`M0 16H${center - notch - 8} M${center + notch + 8} 16H${w}
      M0 ${bottom - 8}H${center - notch - 8}L${center - notch} ${bottom}H${center + notch}L${center + notch + 8} ${bottom - 8}H${w}`}
      fill="none" stroke="#eee" strokeWidth={1} />
    <G stroke="#ffffff40" strokeWidth={0.8}>
      {Array.from({ length: stripes }, (_, i) => <Path key={i}
        d={`M${3 + i * 9} ${height - 4}l8 -8 M${w - 3 - i * 9} ${height - 4}l-8 -8`} />)}
    </G>
  </Svg>;
}

export function GroupUniverseIcon({ kind, size = 40 }: { kind: 'back' | 'members'; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 40 40" pointerEvents="none">
    <Circle cx={20} cy={20} r={19} fill="#00000080" stroke="#fff" strokeWidth={2} />
    {kind === 'back'
      ? <Path d="M18 8L8 18l10 10v-7c8-1 11 3 13 9 1-11-3-16-13-16Z" fill="#fff" />
      : <><Circle cx={18} cy={15} r={4.5} fill="#fff" />
        <Path d="M10 28c0-10 15-10 15 0Z" fill="#fff" />
        <Circle cx={27} cy={26} r={5.5} fill="#fff" stroke="#000" strokeWidth={1.5} />
        <Path d="M27 23v6 M24 26h6" stroke="#000" strokeWidth={1.4} />
      </>}
  </Svg>;
}

export function GroupPanelFrame() {
  return <Svg width="100%" height="100%" viewBox="0 0 236 488" preserveAspectRatio="none" pointerEvents="none">
    <Path d="M15 1H88L94 5H154L160 1H220L235 17V471L220 487H154L148 483H86L80 487H14L1 472V17Z"
      fill="#5e5e69" stroke="#fff" strokeWidth={1} />
  </Svg>;
}

export function GroupSendIcon({ size = 27 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 28 28" pointerEvents="none">
    <Path d="M4 4L24 14 4 24l4-10Z M8 14h9" fill="none" stroke="#fff" strokeWidth={2}
      strokeLinejoin="round" strokeLinecap="round" />
  </Svg>;
}

export function GroupChatChevron({ expanded, size = 14 }: { expanded: boolean; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 16 16" pointerEvents="none">
    <Path d={expanded ? 'M3 5l5 5 5-5' : 'M3 11l5-5 5 5'} fill="none" stroke="#fff"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
