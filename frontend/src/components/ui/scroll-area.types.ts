import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
export type ScrollAreaProps = {
  children: ReactNode;
  horizontal?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  label: string;
  scrollbarLabel: string;
  scrollStep?: number;
  hideScrollbarWhenNotScrollable?: boolean;
  testID: string;
};
