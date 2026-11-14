import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function SearchPopupFrame() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 440 640" preserveAspectRatio="none">
      <Defs><LinearGradient id="search-panel" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#0e141e" /><Stop offset="0.5" stopColor="#020407" /><Stop offset="1" stopColor="#121822" />
      </LinearGradient></Defs>
      <Path d="M20 2H152L162 8H278L288 2H420L438 20V610L418 630H22L2 610V20Z" fill="url(#search-panel)" stroke="#e3e7ee" strokeWidth="1.2" />
      <Path d="M14 36V22L27 10H145 M295 10H413L427 23V36 M14 584V607L29 622H120 M320 622H412L427 607V584" fill="none" stroke="#747d8c" strokeWidth="1" />
      <Path d="M32 636L40 630M44 636L52 630M56 636L64 630M68 636L76 630M80 636L88 630 M352 636L360 630M364 636L372 630M376 636L384 630M388 636L396 630M400 636L408 630" stroke="#c2c7cf" strokeWidth="3" />
      <Path d="M146 631H215V639H137Z M225 631H294L303 639H225Z" fill="#252b35" stroke="#79818f" strokeWidth=".7" />
    </Svg>
  </View>;
}
