import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { translate } from '../src/lib/translations.ts';

let resolveRead;
let reads = 0;
const saved = new Map();
globalThis.__languageStorage = {
  getItem: () => { reads++; return new Promise(resolve => { resolveRead = resolve; }); },
  setItem: async (key, value) => { saved.set(key, value); },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') return {url:'data:text/javascript,export default globalThis.__languageStorage',shortCircuit:true};
  if (specifier === './translations' && context.parentURL?.endsWith('/language.ts')) return {url:new URL('../src/lib/translations.ts',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
} });
const language = await import('../src/lib/language.ts');

test('switching while saved settings load preserves the newer choice and persists the final rapid selection', async () => {
  const restoring = language.loadLanguage();
  language.loadLanguage();
  language.setLanguage('en');
  resolveRead('ko');
  await restoring;
  assert.equal(reads,1);
  assert.equal(language.getLanguage(),'en');
  language.setLanguage('ko'); language.setLanguage('en'); language.setLanguage('ko');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved.get('settings:language'),'ko');
  language.setLanguage('fr');
  assert.equal(language.getLanguage(),'ko');
});

test('UI labels and numeric placeholders translate while authored content stays untouched', () => {
  assert.equal(translate('en','그룹 알림 받기'),'Enable group alerts');
  assert.equal(translate('en','{completed}/{total}명',{completed:2,total:6}),'2/6 members');
  assert.equal(translate('ko','{completed}/{total}명',{completed:2,total:6}),'2/6명');
  assert.equal(translate('en','내가 쓴 일기와 그룹 이름'),'내가 쓴 일기와 그룹 이름');
  assert.equal(translate('ko','상점'),'상점');
});
