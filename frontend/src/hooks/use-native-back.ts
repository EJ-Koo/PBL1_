import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
export function useNativeBack(close: () => void, enabled = true) {
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [close, enabled]);
}
