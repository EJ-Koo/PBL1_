import { forwardRef, useSyncExternalStore } from 'react';
import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { getFontScale, subscribeFontScale } from '@/lib/settings';

function useTextStyle(style: TextProps['style']) {
  const scale = useSyncExternalStore(subscribeFontScale, getFontScale, () => 1);
  const flat = StyleSheet.flatten(style) ?? {};
  const scaled: TextStyle = {};
  if (typeof flat.fontSize === 'number') scaled.fontSize = flat.fontSize * scale;
  if (typeof flat.lineHeight === 'number') scaled.lineHeight = flat.lineHeight * scale;
  return [style, scaled];
}
export const Text = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  return <NativeText ref={ref} {...props} style={useTextStyle(style)} />;
});
export type TextInput = NativeTextInput;
// The value component and native ref type intentionally share the public name.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  return <NativeTextInput ref={ref} {...props} style={useTextStyle(style)} />;
});
