import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** Draw the shop's cut corners without clipping its contents or touch targets. */
export function ShopFrame({ fill, cut = 32, tab = false }: { fill: string; cut?: number; tab?: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const edge = 0.6;
  const corner = Math.min(cut, width / 3, height / 3);
  const path = tab
    ? `M ${corner} ${edge} H ${width - edge} V ${height - corner} L ${width - corner} ${height - edge} H ${edge} V ${corner} Z`
    : `M ${corner} ${edge} H ${width - corner} L ${width - edge} ${corner} V ${height - corner} L ${width - corner} ${height - edge} H ${corner} L ${edge} ${height - corner} V ${corner} Z`;

  return <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={StyleSheet.absoluteFill} onLayout={event => {
      const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
      setSize(previous => previous.width === nextWidth && previous.height === nextHeight ? previous : { width: nextWidth, height: nextHeight });
    }}>
    {width > 0 && height > 0 ? <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={path} fill={fill} stroke="#D9D9D9" strokeWidth={1.2} />
    </Svg> : null}
  </View>;
}

export function ShopSectionRule() {
  return <View pointerEvents="none" aria-hidden style={styles.rule}>
    <View style={styles.line} />
    <Svg width={38} height={12} viewBox="0 0 38 12">
      <Path d="M1 10L7 2 M7 10L13 2 M13 10L19 2 M19 10L25 2 M25 10L31 2 M31 10L37 2"
        stroke="#D9D9D9" strokeWidth={0.6} />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  rule: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  line: { flex: 1, height: 1, backgroundColor: '#747478' },
});
