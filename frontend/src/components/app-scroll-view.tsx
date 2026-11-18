import { forwardRef } from 'react';
import { Platform, ScrollView as NativeScrollView, StyleSheet, type ScrollViewProps } from 'react-native';

export type ScrollViewHandle = NativeScrollView;

/** Give web scrollbar tracks their own space beyond the reading/card area. */
export const ScrollView = forwardRef<NativeScrollView, ScrollViewProps>(function AppScrollView(
  { horizontal, style, contentContainerStyle, ...props }, ref,
) {
  const outer = StyleSheet.flatten(style) ?? {};
  const content = StyleSheet.flatten(contentContainerStyle) ?? {};
  const web = Platform.OS === 'web' && (horizontal ? props.showsHorizontalScrollIndicator !== false : props.showsVerticalScrollIndicator !== false);
  const right = content.paddingRight ?? content.paddingHorizontal ?? content.padding ?? 0;
  const bottom = content.paddingBottom ?? content.paddingVertical ?? content.padding ?? 0;
  return <NativeScrollView {...props} ref={ref} horizontal={horizontal}
    {...(web ? { dataSet: { appScrollAxis: horizontal ? 'horizontal' : 'vertical' } } : {})}
    style={[style, web && (horizontal
      ? { marginBottom: (typeof (outer.marginBottom ?? outer.marginVertical ?? outer.margin) === 'number' ? Number(outer.marginBottom ?? outer.marginVertical ?? outer.margin) : 0) - 8 }
      : { marginRight: (typeof (outer.marginRight ?? outer.marginHorizontal ?? outer.margin) === 'number' ? Number(outer.marginRight ?? outer.marginHorizontal ?? outer.margin) : 0) - 8 })]}
    contentContainerStyle={[contentContainerStyle, web && (horizontal
      ? { paddingBottom: (typeof bottom === 'number' ? bottom : 0) + 12 }
      : { paddingRight: (typeof right === 'number' ? right : 0) + 12 })]} />;
});
