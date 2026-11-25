import { StyleSheet, View } from 'react-native';
import { ScrollView } from '@/components/app-scroll-view';
import type { ScrollAreaProps as Props } from './scroll-area.types';
export function ScrollArea({ children, horizontal = false, style, contentContainerStyle, label, testID }: Props) {
  return <View style={[{ minWidth: 0, minHeight: 0 }, style]} testID={testID}>
    <ScrollView horizontal={horizontal} nestedScrollEnabled directionalLockEnabled
      showsHorizontalScrollIndicator={horizontal} showsVerticalScrollIndicator={!horizontal}
      indicatorStyle="white" keyboardShouldPersistTaps="handled" accessibilityLabel={label}
      testID={`${testID}-content`} style={horizontal ? styles.row : styles.column}
      contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ row: { flexGrow: 0, minWidth: 0 }, column: { flex: 1, minHeight: 0 } });
