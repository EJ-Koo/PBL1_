import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

// Outlined lettering keeps the reference's angular display style on every platform.
const letters = [
  'M29 1H4L1 4V13L4 16H26L29 19V28L26 31H1',
  'M29 1H1V31H29M1 16H25',
  'M1 31V5L5 1H25L29 5V31M1 18H29',
  'M29 1H4L1 4V13L4 16H26L29 19V28L26 31H1',
  'M5 1H25L29 5V27L25 31H5L1 27V5Z',
  'M1 31V1L29 31V1',
  'M29 1H4L1 4V13L4 16H26L29 19V28L26 31H1',
];

export function ArchiveHeading() {
  return <View style={styles.header} accessible accessibilityRole="header" accessibilityLabel="SEASONS — DIARY ARCHIVE">
    <Svg width="100%" height="100%" viewBox="0 0 540 104" pointerEvents="none">
      <Path d="M25 9H7V23M7 82V96H25M514 9H533V23" fill="none" stroke="#d9d9d9" strokeWidth="2.5" />
      <Path d="M36 9H503M36 96H270L303 62H533V46" fill="none" stroke="#a7a7a7" strokeWidth="1.7" />
      <Path d="M307 52L337 20H359L329 52ZM341 52L371 20H393L363 52ZM375 52L405 20H427L397 52ZM409 52L439 20H520V52Z" fill="#d9d9d9" />
      <G transform="translate(35 41)" fill="none" stroke="#f5f5f5" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round">
        {letters.map((d, index) => <Path key={index} d={d} transform={`translate(${index * 35} 0)`} />)}
      </G>
      <SvgText x="521" y="81" textAnchor="end" fill="#c1c1c1" fontSize="13" fontFamily="sans-serif" letterSpacing="0.7">[DIARY ARCHIVE]</SvgText>
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  header: { width: '100%', aspectRatio: 540 / 104, marginTop: 12, flexShrink: 0 },
});
