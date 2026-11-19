import AsyncStorage from '@react-native-async-storage/async-storage';

import { WEB_SESSION_KEY as KEY } from './session-core';
export const sessionStorage = {
  getItem: () => AsyncStorage.getItem(KEY),
  setItem: (value: string) => AsyncStorage.setItem(KEY, value),
  removeItem: () => AsyncStorage.removeItem(KEY),
};
