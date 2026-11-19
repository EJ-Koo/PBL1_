import { StyleSheet, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { DesignFonts } from '@/constants/ui-design';

export function ArchiveHeading() {
  return <View style={styles.header} accessible accessibilityRole="header" accessibilityLabel="SEASONS — DIARY ARCHIVE">
    <Svg width="100%" height="100%" viewBox="0 0 540 104" pointerEvents="none">
      <Path d="M25 9H7V23M7 82V96H25M514 9H533V23" fill="none" stroke="#d9d9d9" strokeWidth="2.5" />
      <Path d="M36 9H503M36 96H270L303 62H533V46" fill="none" stroke="#a7a7a7" strokeWidth="1.7" />
      <Path d="M307 52L337 20H359L329 52ZM341 52L371 20H393L363 52ZM375 52L405 20H427L397 52ZM409 52L439 20H520V52Z" fill="#d9d9d9" />
      <SvgText x="35" y="73" fill="#f5f5f5" fontFamily={DesignFonts.bold} fontSize="41">SEASONS</SvgText>
      <SvgText x="521" y="81" textAnchor="end" fill="#c1c1c1" fontSize="13" fontFamily={DesignFonts.regular} letterSpacing="0.7">[DIARY ARCHIVE]</SvgText>
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  header: { width: '100%', aspectRatio: 540 / 104, marginTop: 12, flexShrink: 0 },
});
