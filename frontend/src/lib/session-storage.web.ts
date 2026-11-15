import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'star2day:session:v1';
export const sessionStorage = {
  getItem: () => AsyncStorage.getItem(KEY),
  setItem: (value: string) => AsyncStorage.setItem(KEY, value),
  removeItem: () => AsyncStorage.removeItem(KEY),
};
