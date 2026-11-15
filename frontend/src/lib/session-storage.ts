import * as SecureStore from 'expo-secure-store';

const KEY = 'star2day.session.v1';
export const sessionStorage = {
  getItem: () => SecureStore.getItemAsync(KEY),
  setItem: (value: string) => SecureStore.setItemAsync(KEY, value),
  removeItem: () => SecureStore.deleteItemAsync(KEY),
};
