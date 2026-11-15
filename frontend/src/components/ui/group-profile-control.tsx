import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, TextInput } from '@/components/app-text';
import { apiGetProfile, type ApiProfile, type ProfileDraft } from '@/lib/profile-api';
import { pickPhotos } from '@/lib/photos';
import { useDiary, type SaveResult } from '@/store/diary-context';

type Anchor = { x: number; y: number; width: number; height: number };
function Avatar({ uri, size }: { uri?: string | null; size: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#05060a', borderWidth: 1, borderColor: '#e0e2ea' }}>
    {uri && uri !== failed ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} onError={() => setFailed(uri)} />
      : <Svg width="100%" height="100%" viewBox="0 0 48 48"><Circle cx={24} cy={17} r={7} fill="#f1f2f6" /><Path d="M10 38C10 25 38 25 38 38Q24 46 10 38" fill="#f1f2f6" /></Svg>}
  </View>;
}

export function GroupProfileControl({ scale }: { scale: number }) {
  const { accessToken, profile, saveProfile } = useDiary();
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return <>
    <View ref={button} collapsable={false} style={{ position: 'absolute', top: 7 * scale, right: 8 * scale }}>
      <Pressable accessibilityRole="button" accessibilityLabel="내 프로필 설정" accessibilityState={{ expanded: !!anchor }}
        onPress={() => button.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }))}>
        <Avatar uri={profile?.avatar_url} size={Math.max(44, 48 * scale)} />
      </Pressable>
    </View>
    {anchor && accessToken && <ProfilePanel anchor={anchor} token={accessToken} initial={profile} onSave={saveProfile} onClose={() => setAnchor(null)} />}
  </>;
}

function ProfilePanel({ anchor, token, initial, onSave, onClose }: {
  anchor: Anchor; token: string; initial: ApiProfile | null;
  onSave: (draft: ProfileDraft) => Promise<SaveResult>; onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [availableHeight, setAvailableHeight] = useState(height);
  const [requestToken] = useState(token);
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [photo, setPhoto] = useState<string | null>(initial?.avatar_url ?? null);
  const [avatarPath, setAvatarPath] = useState<string | null>(initial?.avatar_path ?? null);
  const [newPhoto, setNewPhoto] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);
  const lock = useRef(false);
  const panelWidth = Math.min(340, width - insets.left - insets.right - 32);
  const left = Math.max(insets.left + 16, Math.min(anchor.x + anchor.width - panelWidth, width - insets.right - panelWidth - 16));
  const top = Math.max(insets.top + 12, anchor.y + anchor.height + 14);
  const maxHeight = Math.max(100, Math.min(540, availableHeight - top - insets.bottom - 16));
  const pointer = Math.max(20, Math.min(panelWidth - 20, anchor.x + anchor.width / 2 - left));
  const close = () => { if (!lock.current) onClose(); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    apiGetProfile(requestToken).then(value => {
      if (!active) return;
      setNickname(value?.nickname ?? ''); setBio(value?.bio ?? '');
      setPhoto(value?.avatar_url ?? null); setAvatarPath(value?.avatar_path ?? null); setLoaded(true);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '프로필을 불러오지 못했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestToken, retry]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !lock.current) onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);
  const choosePhoto = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const selected = (await pickPhotos(1))[0];
      if (selected && alive.current) { setPhoto(selected.uri); setNewPhoto(selected.uri); }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '사진을 선택하지 못했어요.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const save = async () => {
    if (lock.current || !loaded) return;
    if (!nickname.trim()) { setError('닉네임을 입력해주세요.'); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await onSave({ nickname: nickname.trim(), bio: bio.trim(), avatar_path: avatarPath, avatarUri: newPhoto });
      if (!alive.current) return;
      if (result.ok) onClose(); else setError(result.error);
    } catch { if (alive.current) setError('프로필을 저장하지 못했어요. 다시 시도해주세요.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={close}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1 }} onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}>
        <Pressable accessibilityLabel="프로필 설정 닫기" style={StyleSheet.absoluteFill} onPress={close} />
        <View accessibilityViewIsModal style={[styles.panel, { left, top, width: panelWidth, maxHeight }]}>
          <View pointerEvents="none" style={[styles.pointer, { left: pointer - 8 }]} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>내 프로필</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="프로필 설정 닫기" onPress={close} disabled={busy} style={styles.close}><Text style={styles.text}>✕</Text></Pressable></View>
            {loading ? <ActivityIndicator color="#e4e5ef" /> : <>
              {loaded && <>
                <Pressable accessibilityRole="button" accessibilityLabel="프로필 사진 업로드" disabled={busy} onPress={choosePhoto} style={styles.photo}>
                  <Avatar uri={photo} size={96} /><Text style={styles.text}>{photo ? '사진 변경' : '사진 업로드'}</Text>
                </Pressable>
                <Text style={styles.label}>닉네임</Text>
                <TextInput accessibilityLabel="닉네임" value={nickname} onChangeText={setNickname} maxLength={24} editable={!busy} style={styles.input} placeholder="닉네임 (최대 24자)" placeholderTextColor="#a3a6b2" />
                <Text style={styles.label}>한 줄 소개</Text>
                <TextInput accessibilityLabel="한 줄 소개" value={bio} onChangeText={setBio} maxLength={80} editable={!busy} style={styles.input} placeholder="나를 소개해주세요 (최대 80자)" placeholderTextColor="#a3a6b2" />
              </>}
              {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              {!loaded ? <Pressable style={styles.save} onPress={() => { setError(null); setLoading(true); setRetry(value => value + 1); }}><Text style={styles.saveText}>다시 불러오기</Text></Pressable>
                : <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} style={[styles.save, busy && { opacity: 0.5 }]} onPress={save}><Text style={styles.saveText}>{busy ? '처리 중…' : '완료'}</Text></Pressable>}
            </>}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  panel: { position: 'absolute', backgroundColor: '#383b43', borderWidth: 1, borderColor: '#aeb2bd' },
  pointer: { position: 'absolute', top: -9, width: 16, height: 16, backgroundColor: '#383b43', borderLeftWidth: 1, borderTopWidth: 1, borderColor: '#aeb2bd', transform: [{ rotate: '45deg' }] },
  form: { padding: 22, gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#f1f2f6', fontSize: 20, fontWeight: '700' }, text: { color: '#eff0f6', fontSize: 14 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  photo: { alignSelf: 'center', alignItems: 'center', gap: 8, marginBottom: 10 },
  label: { color: '#eeeef5', fontSize: 14 }, input: { minHeight: 44, backgroundColor: '#22252d', borderWidth: 1, borderColor: '#8c929f', padding: 10, color: '#fff', fontSize: 15 },
  error: { color: '#ffd0cb', fontSize: 13, lineHeight: 20 },
  save: { backgroundColor: '#e0e2e9', padding: 12, alignItems: 'center', marginTop: 16 }, saveText: { color: '#171a23', fontSize: 15, fontWeight: '700' },
});
