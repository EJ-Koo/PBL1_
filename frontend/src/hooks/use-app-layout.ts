import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNativeUi } from '@/lib/native-layout';

// Keep native sizing independent of the web artwork and shared business logic.
export function useAppLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return { native: Platform.OS !== 'web', ...getNativeUi(width, height, insets.top, insets.bottom) };
}
