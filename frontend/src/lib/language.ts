import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';
import { translate, type Language } from './translations';

const KEY = 'settings:language';
let language: Language = 'ko';
let revision = 0;
let loading: Promise<void> | undefined;
let writing = Promise.resolve();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getLanguage = () => language;
function notify() {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach(listener => listener());
}
export function setLanguage(next: Language) {
  if ((next !== 'ko' && next !== 'en') || language === next) return;
  revision++; language = next; notify();
  writing = writing.catch(() => {}).then(() => AsyncStorage.setItem(KEY, next));
  void writing.catch(() => {});
}
export function loadLanguage() {
  const ticket = revision;
  return loading ??= AsyncStorage.getItem(KEY).then(saved => {
    if (revision === ticket && (saved === 'ko' || saved === 'en')) { language = saved; notify(); }
  }).catch(() => {});
}
export function useLanguage() {
  const current = useSyncExternalStore(subscribe, getLanguage, () => 'ko' as Language);
  const t = useCallback((source: string, values?: Record<string, string | number>) => translate(current, source, values), [current]);
  return { language: current, setLanguage, t };
}
