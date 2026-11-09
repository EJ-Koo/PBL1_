// [ADDED 2026-11-07] 관리자 화면: 상점 아이템 · 사용자 코인 · 설정값.
// 저장하면 서버(Supabase)에 바로 반영되고, 앱은 다음에 상점을 열 때 새 값을 받는다.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { confirmChoice, showNotice } from '@/lib/notice';
import {
  apiAdminAdjustCoins,
  apiAdminCoinLogs,
  apiAdminCreateItem,
  apiAdminListConfig,
  apiAdminListItems,
  apiAdminListWallets,
  apiAdminResetWallet,
  apiAdminSetConfig,
  apiAdminUpdateItem,
  type AdminConfigEntry,
  type AdminItem,
  type AdminWallet,
  type CoinLog,
} from '@/lib/shop-api';

const errText = (err: unknown) => (err instanceof Error ? err.message : '요청에 실패했습니다.');

function useLoader<T>(load: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
    } catch (err) {
      showNotice('불러오기 실패', errText(err));
    } finally {
      setLoading(false);
    }
  }, [load]);
  // 처음 열 때: 응답이 온 뒤에만 상태를 바꾼다.
  useEffect(() => {
    let alive = true;
    load()
      .then((value) => alive && setData(value))
      .catch((err) => alive && showNotice('불러오기 실패', errText(err)));
    return () => {
      alive = false;
    };
  }, [load]);
  return { data, setData, loading, reload };
}

function Field({
  label,
  value,
  onChange,
  numeric,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  multiline?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'numeric' : 'default'}
        multiline={multiline}
        autoCapitalize="none"
        placeholderTextColor="#666"
      />
    </View>
  );
}

function Button({ label, onPress, kind = 'primary', disabled, testID }: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, kind === 'ghost' && styles.buttonGhost, kind === 'danger' && styles.buttonDanger, disabled && styles.buttonDisabled]}>
      <Text style={[styles.buttonText, kind !== 'primary' && styles.buttonTextAlt]}>{label}</Text>
    </Pressable>
  );
}

// --- 아이템 ---------------------------------------------------------------------

type ItemForm = {
  id: string;
  name: string;
  icon: string;
  description: string;
  price: string;
  kind: 'consumable' | 'equip';
  slot: string;
  effect: string;
  sort_order: string;
  is_active: boolean;
};

const toForm = (i?: AdminItem): ItemForm => ({
  id: i?.id ?? '',
  name: i?.name ?? '',
  icon: i?.icon ?? '⭐',
  description: i?.description ?? '',
  price: String(i?.price ?? 0),
  kind: i?.kind ?? 'equip',
  slot: i?.slot ?? '',
  effect: JSON.stringify(i?.effect ?? {}),
  sort_order: String(i?.sort_order ?? 0),
  is_active: i?.is_active ?? true,
});

/** 폼 → 서버로 보낼 값. 숫자·JSON 이 잘못되면 오류 문장을 돌려준다. */
function fromForm(f: ItemForm): { ok: true; value: Partial<AdminItem> } | { ok: false; error: string } {
  const price = Number(f.price);
  const sort = Number(f.sort_order);
  if (!Number.isInteger(price) || price < 0) return { ok: false, error: '가격은 0 이상의 정수여야 합니다.' };
  if (!Number.isInteger(sort)) return { ok: false, error: '정렬 순서는 정수여야 합니다.' };
  let effect: AdminItem['effect'];
  try {
    effect = JSON.parse(f.effect || '{}');
    if (typeof effect !== 'object' || effect === null || Array.isArray(effect)) throw new Error();
  } catch {
    return { ok: false, error: '효과(effect)는 {"type":"..."} 형태의 JSON이어야 합니다.' };
  }
  if (f.kind === 'equip' && !f.slot.trim()) return { ok: false, error: '장착 아이템은 칸(slot)이 필요합니다. 예: background' };
  return {
    ok: true,
    value: {
      name: f.name.trim(),
      icon: f.icon.trim(),
      description: f.description,
      price,
      slot: f.kind === 'equip' ? f.slot.trim() : null,
      effect,
      sort_order: sort,
      is_active: f.is_active,
    },
  };
}

function ItemEditor({ initial, isNew, onSave, onCancel }: {
  initial: ItemForm;
  isNew: boolean;
  onSave: (f: ItemForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ItemForm) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <View style={styles.editor}>
      {isNew && <Field label="id (영문 소문자·숫자·_-, 나중에 못 바꿈)" value={f.id} onChange={set('id')} testID="item-id" />}
      {isNew && (
        <View style={styles.rowWrap}>
          {(['equip', 'consumable'] as const).map((k) => (
            <Button key={k} label={k === 'equip' ? '장착 아이템' : '소모품'} kind={f.kind === k ? 'primary' : 'ghost'} onPress={() => setF((p) => ({ ...p, kind: k }))} />
          ))}
        </View>
      )}
      <View style={styles.rowWrap}>
        <View style={styles.flex1}><Field label="아이콘" value={f.icon} onChange={set('icon')} /></View>
        <View style={styles.flex3}><Field label="이름" value={f.name} onChange={set('name')} testID="item-name" /></View>
      </View>
      <Field label="설명" value={f.description} onChange={set('description')} />
      <View style={styles.rowWrap}>
        <View style={styles.flex1}><Field label="가격" value={f.price} onChange={set('price')} numeric testID="item-price" /></View>
        <View style={styles.flex1}><Field label="정렬 순서" value={f.sort_order} onChange={set('sort_order')} numeric /></View>
        {f.kind === 'equip' && <View style={styles.flex1}><Field label="칸(slot)" value={f.slot} onChange={set('slot')} /></View>}
      </View>
      <Field label='효과 JSON (예: {"type":"background","tint":"#0B2A6B","opacity":0.45})' value={f.effect} onChange={set('effect')} multiline />
      <View style={styles.switchRow}>
        <Text style={styles.fieldLabel}>상점에서 판매</Text>
        <Switch value={f.is_active} onValueChange={(v) => setF((p) => ({ ...p, is_active: v }))} />
      </View>
      <View style={styles.rowWrap}>
        <Button label="취소" kind="ghost" onPress={onCancel} />
        <Button
          testID="item-save"
          label={saving ? '저장 중…' : '저장'}
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            await onSave(f);
            setSaving(false);
          }}
        />
      </View>
    </View>
  );
}

export function AdminItemsPanel({ token }: { token: string }) {
  const load = useCallback(() => apiAdminListItems(token), [token]);
  const { data: items, setData, loading, reload } = useLoader<AdminItem[]>(load, []);
  const [editing, setEditing] = useState<string | null>(null); // 아이템 id, 새 아이템은 '__new__'

  const save = async (f: ItemForm, isNew: boolean) => {
    const parsed = fromForm(f);
    if (!parsed.ok) {
      showNotice('입력 확인', parsed.error);
      return;
    }
    try {
      const saved = isNew
        ? await apiAdminCreateItem(token, { ...parsed.value, id: f.id.trim(), kind: f.kind })
        : await apiAdminUpdateItem(token, f.id, parsed.value);
      setData((prev) => (isNew ? [...prev, saved] : prev.map((i) => (i.id === saved.id ? saved : i))).sort((a, b) => a.sort_order - b.sort_order));
      setEditing(null);
    } catch (err) {
      showNotice('저장 실패', errText(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.help}>값을 바꾸고 저장하면 앱 상점에 바로 반영됩니다. 판매를 끄면 새로 살 수 없지만, 이미 산 사람은 계속 씁니다.</Text>
      <View style={styles.rowWrap}>
        <Button label="+ 새 아이템" onPress={() => setEditing('__new__')} testID="item-new" />
        <Button label={loading ? '불러오는 중…' : '새로고침'} kind="ghost" onPress={reload} />
      </View>
      {editing === '__new__' && <ItemEditor initial={toForm()} isNew onSave={(f) => save(f, true)} onCancel={() => setEditing(null)} />}
      {items.map((item) =>
        editing === item.id ? (
          <ItemEditor key={item.id} initial={toForm(item)} isNew={false} onSave={(f) => save(f, false)} onCancel={() => setEditing(null)} />
        ) : (
          <View key={item.id} style={styles.row} testID={`admin-item-${item.id}`}>
            <Text style={styles.icon}>{item.icon}</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>
                {item.name} · 🪙 {item.price} {item.is_active ? '' : '(판매 중지)'}
              </Text>
              <Text style={styles.rowMeta}>
                {item.id} · {item.kind === 'equip' ? `장착(${item.slot})` : '소모품'} · {JSON.stringify(item.effect)}
              </Text>
            </View>
            <Button label="수정" kind="ghost" onPress={() => setEditing(item.id)} testID={`item-edit-${item.id}`} />
          </View>
        )
      )}
    </ScrollView>
  );
}

// --- 사용자 코인 ------------------------------------------------------------------

function WalletRow({ token, wallet, onChanged }: { token: string; wallet: AdminWallet; onChanged: (coins: number) => void }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('100');
  const [memo, setMemo] = useState('');
  const [logs, setLogs] = useState<CoinLog[] | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLogs = async () => {
    try {
      setLogs(await apiAdminCoinLogs(token, wallet.user_id));
    } catch (err) {
      showNotice('기록 불러오기 실패', errText(err));
    }
  };

  const apply = async (sign: 1 | -1) => {
    const n = Number(delta);
    if (!Number.isInteger(n) || n <= 0) {
      showNotice('입력 확인', '1 이상의 정수를 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiAdminAdjustCoins(token, wallet.user_id, sign * n, memo.trim());
      onChanged(res.coins ?? 0);
      await loadLogs();
    } catch (err) {
      showNotice('변경 실패', errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID={`wallet-${wallet.user_id}`}>
      <Pressable
        style={styles.rowInline}
        onPress={() => {
          setOpen((v) => !v);
          if (!open && logs === null) loadLogs();
        }}>
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle}>{wallet.nickname ?? wallet.email ?? wallet.user_id}</Text>
          <Text style={styles.rowMeta}>{wallet.email}</Text>
        </View>
        <Text style={styles.coins}>🪙 {wallet.coins ?? '아직 없음'}</Text>
      </Pressable>
      {open && (
        <View style={styles.editor}>
          <View style={styles.rowWrap}>
            <View style={styles.flex1}><Field label="코인" value={delta} onChange={setDelta} numeric testID="coin-delta" /></View>
            <View style={styles.flex2}><Field label="메모 (선택)" value={memo} onChange={setMemo} /></View>
          </View>
          <View style={styles.rowWrap}>
            <Button label="+ 지급" disabled={busy} onPress={() => apply(1)} testID="coin-add" />
            <Button label="- 차감" kind="danger" disabled={busy} onPress={() => apply(-1)} />
            <Button
              testID="wallet-reset"
              label="↺ 초기화"
              kind="ghost"
              disabled={busy}
              onPress={() =>
                confirmChoice(
                  '초기화 (테스트용)',
                  '이 사용자의 코인을 시작 코인으로 되돌리고, 산 아이템과 코인 기록을 모두 지웁니다.',
                  '초기화',
                  async () => {
                    setBusy(true);
                    try {
                      const res = await apiAdminResetWallet(token, wallet.user_id);
                      onChanged(res.coins ?? 0);
                      await loadLogs();
                    } catch (err) {
                      showNotice('초기화 실패', errText(err));
                    } finally {
                      setBusy(false);
                    }
                  }
                )
              }
            />
          </View>
          <Text style={styles.fieldLabel}>최근 기록</Text>
          {logs === null ? (
            <ActivityIndicator color="#fff" />
          ) : logs.length === 0 ? (
            <Text style={styles.rowMeta}>기록 없음</Text>
          ) : (
            logs.slice(0, 20).map((l, idx) => (
              <Text key={idx} style={styles.rowMeta}>
                {new Date(l.created_at).toLocaleString()} · {l.delta > 0 ? '+' : ''}{l.delta} → {l.balance} · {l.reason}{l.ref ? ` (${l.ref})` : ''}
              </Text>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export function AdminWalletsPanel({ token }: { token: string }) {
  const load = useCallback(() => apiAdminListWallets(token), [token]);
  const { data: wallets, setData, loading, reload } = useLoader<AdminWallet[]>(load, []);
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.help}>사용자를 누르면 코인을 지급·차감하고 기록을 볼 수 있습니다. ‘아직 없음’은 앱에서 코인을 한 번도 불러오지 않은 사용자입니다(지급하면 시작 코인 + 지급액).</Text>
      <Button label={loading ? '불러오는 중…' : '새로고침'} kind="ghost" onPress={reload} />
      {wallets.map((w) => (
        <WalletRow
          key={w.user_id}
          token={token}
          wallet={w}
          onChanged={(coins) => setData((prev) => prev.map((x) => (x.user_id === w.user_id ? { ...x, coins } : x)))}
        />
      ))}
    </ScrollView>
  );
}

// --- 설정값 ---------------------------------------------------------------------

function ConfigRow({ token, entry, onSaved }: { token: string; entry: AdminConfigEntry; onSaved: (e: AdminConfigEntry) => void }) {
  const [value, setValue] = useState(String(entry.value ?? ''));
  const [busy, setBusy] = useState(false);

  const save = async (next: unknown) => {
    setBusy(true);
    try {
      onSaved(await apiAdminSetConfig(token, entry.key, next));
    } catch (err) {
      showNotice('저장 실패', errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID={`config-row-${entry.key}`}>
      <Text style={styles.rowTitle}>{entry.key}</Text>
      <Text style={styles.rowMeta}>{entry.description}</Text>
      {entry.kind === 'bool' ? (
        // [ADDED 2026-11-09] 켜기/끄기 설정은 스위치로 바로 저장
        <View style={styles.switchRow}>
          <Text style={styles.rowMeta}>{entry.value ? '켜짐' : '꺼짐'}</Text>
          <Switch
            testID={`config-switch-${entry.key}`}
            value={Boolean(entry.value)}
            disabled={busy}
            onValueChange={(v) => save(v)}
          />
        </View>
      ) : (
        <>
          <Text style={styles.rowMeta}>현재 값: {JSON.stringify(entry.value)}</Text>
          <View style={styles.rowWrap}>
            <View style={styles.flex1}><Field label="새 값" value={value} onChange={setValue} numeric testID={`config-${entry.key}`} /></View>
            <Button
              testID={`config-save-${entry.key}`}
              label={busy ? '저장 중…' : '저장'}
              disabled={busy}
              // 숫자가 아니면 문자열 그대로 보내 서버가 거부하게 한다.
              onPress={() => save(value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : value)}
            />
          </View>
        </>
      )}
    </View>
  );
}

export function AdminConfigPanel({ token }: { token: string }) {
  const load = useCallback(() => apiAdminListConfig(token), [token]);
  const { data, setData } = useLoader<AdminConfigEntry[]>(load, []);
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.help}>바꾼 값은 저장 즉시 적용됩니다. 시작 코인은 이미 지갑이 있는 사용자에게는 영향이 없습니다.</Text>
      {data.map((e) => (
        <ConfigRow key={e.key} token={token} entry={e} onSaved={(n) => setData((prev) => prev.map((x) => (x.key === n.key ? n : x)))} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 32, gap: 10 },
  help: { color: '#9C9CC0', fontSize: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A45',
    padding: 12,
    gap: 10,
  },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { backgroundColor: '#14142A', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A45', padding: 12, gap: 6 },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#9C9CC0', fontSize: 12 },
  icon: { fontSize: 26 },
  coins: { color: '#FED240', fontSize: 15, fontWeight: '700' },
  editor: { backgroundColor: '#1B1B36', borderRadius: 10, padding: 12, gap: 8, borderWidth: 1, borderColor: '#7C6CF6' },
  field: { gap: 4 },
  fieldLabel: { color: '#9C9CC0', fontSize: 12 },
  input: { backgroundColor: '#0B0B1A', color: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#2A2A45', paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  rowWrap: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex1: { flex: 1, minWidth: 70 },
  flex2: { flex: 2, minWidth: 120 },
  flex3: { flex: 3, minWidth: 120 },
  button: { backgroundColor: '#7C6CF6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonGhost: { backgroundColor: '#2A2A45' },
  buttonDanger: { backgroundColor: '#3A1F2E' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  buttonTextAlt: { color: '#E0E0F0' },
});
