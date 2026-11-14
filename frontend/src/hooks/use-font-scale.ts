import { useSyncExternalStore } from 'react';
import { getFontScale, subscribeFontScale } from '@/lib/settings';

const getServerFontScale = () => 1;

export function useFontScale() {
  return useSyncExternalStore(subscribeFontScale, getFontScale, getServerFontScale);
}
