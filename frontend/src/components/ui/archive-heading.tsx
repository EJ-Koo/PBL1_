import { StyleSheet, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/app-text';
import { DesignFonts } from '@/constants/ui-design';
import { GroupHeaderFrame } from './group-decoration';

export function ArchiveHeading({ width = 540, wide = false, scale = 1 }: { width?: number; wide?: boolean; scale?: number }) {
  return <View style={[styles.header, wide && { height: 63 * scale, aspectRatio: undefined, marginTop: 10 * scale }]}
    accessible accessibilityRole="header" accessibilityLabel="SEASONS — DIARY ARCHIVE">
    {wide ? <>
      <GroupHeaderFrame scale={scale} width={width} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ position: 'absolute', left: 18 * scale, top: 14 * scale,
        maxWidth: width - 190 * scale, color: '#f5f5f5', fontFamily: DesignFonts.bold, fontSize: 28 * scale,
        lineHeight: 36 * scale, includeFontPadding: false }}>SEASONS</Text>
      <Text numberOfLines={1} style={{ position: 'absolute', right: 12 * scale, top: 43 * scale,
        color: '#c1c1c1', fontFamily: DesignFonts.regular, fontSize: 9 * scale, lineHeight: 14 * scale }}>[DIARY ARCHIVE]</Text>
    </> : <Svg width="100%" height="100%" viewBox="0 0 540 104" pointerEvents="none" accessible={false}>
      <Path d="M25 9H7V23M7 82V96H25M514 9H533V23" fill="none" stroke="#d9d9d9" strokeWidth="2.5" />
      <Path d="M36 9H503M36 96H270L303 62H533V46" fill="none" stroke="#a7a7a7" strokeWidth="1.7" />
      <Path d="M307 52L337 20H359L329 52ZM341 52L371 20H393L363 52ZM375 52L405 20H427L397 52ZM409 52L439 20H520V52Z" fill="#d9d9d9" />
      <SvgText x="35" y="73" fill="#f5f5f5" fontFamily={DesignFonts.bold} fontSize="41">SEASONS</SvgText>
      <SvgText x="521" y="81" textAnchor="end" fill="#c1c1c1" fontSize="13" fontFamily={DesignFonts.regular} letterSpacing="0.7">[DIARY ARCHIVE]</SvgText>
    </Svg>}
  </View>;
}

const styles = StyleSheet.create({
  header: { width: '100%', aspectRatio: 540 / 104, marginTop: 12, flexShrink: 0 },
});
