import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getResponsiveLayout } from '@/lib/responsive-layout';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return getResponsiveLayout(width, height, insets, Platform.OS === 'android' ? 1.18 : 1);
}
