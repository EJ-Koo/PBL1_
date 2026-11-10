import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavFrame } from './design-decoration';

type Props = {
  scale: number;
  onDiary: () => void;
  onHome: () => void;
  onGroup: () => void;
};

export function UniverseBottomNav({ scale, onDiary, onHome, onGroup }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { left: insets.left, bottom: Math.max(34 * scale, insets.bottom), width: 393 * scale, height: 30 * scale }]}>
      <BottomNavFrame scale={scale} />
      <TouchableOpacity accessibilityLabel="일기 작성" onPress={onDiary} style={[styles.button, { left: 92 * scale, width: 49 * scale, height: 22 * scale, top: 8 * scale }]} />
      <TouchableOpacity accessibilityLabel="나의 우주" onPress={onHome} style={[styles.button, { left: 147 * scale, width: 100 * scale, height: 22 * scale, top: 8 * scale }]} />
      <TouchableOpacity accessibilityLabel="그룹 우주" onPress={onGroup} style={[styles.button, { left: 253 * scale, width: 49 * scale, height: 22 * scale, top: 8 * scale }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 20 },
  button: { position: 'absolute' },
});
