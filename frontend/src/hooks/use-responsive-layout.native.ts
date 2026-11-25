import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBottomNavLayout, getResponsiveLayout } from '@/lib/responsive-layout';

// Metro loads this file only on Android/iOS. Web keeps its existing layout.
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = getResponsiveLayout(width, height, insets);
  const navLayout = getBottomNavLayout(layout.navWidth, 1.2);
  const hudScale = Math.min(0.64, layout.scale * 0.66);
  return { ...layout, navLayout, navHeight: navLayout.height, hudScale, hudHeight: 75 * hudScale,
    headerTop: insets.top + 8,
    bottomSpace: insets.bottom + navLayout.height + 8 };
}
