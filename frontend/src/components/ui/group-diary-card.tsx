import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/app-text';
import { apiReadDiary, type ApiDiary } from '@/lib/api';
import { authSession } from '@/lib/auth-session';
import { useDiary } from '@/store/diary-context';
import { Avatar } from './group-profile-control';
import { SpaceButton } from './space-ui';

export function GroupDiaryCard({ id, onClose }: { id: string; onClose: () => void }) {
  const { accessToken } = useDiary();
  const revision = authSession.getRevision();
  const { width, height } = useWindowDimensions();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; revision: number; attempt: number; diary?: ApiDiary; error?: string } | null>(null);
  const [bodyHeight, setBodyHeight] = useState(220);
  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    apiReadDiary(accessToken, id).then(diary => {
      if (alive && authSession.getRevision() === revision) setResult({ id, revision, attempt, diary });
    }).catch(error => {
      if (alive && authSession.getRevision() === revision) setResult({ id, revision, attempt, error: error instanceof Error ? error.message : '기록을 불러오지 못했어요.' });
    });
    return () => { alive = false; };
  }, [accessToken, id, revision, attempt]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const current = result?.id === id && result.revision === revision && result.attempt === attempt ? result : null;
  const diary = current?.diary;
  const w = Math.min(520, Math.max(0, width - 68));
  const maxHeight = Math.max(160, Math.min(420, height - 190));
  const totalHeight = Math.min(maxHeight, bodyHeight + 108);
  return <View style={styles.overlay} accessibilityViewIsModal>
    <Pressable accessibilityLabel="공유 일기 닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
    <View style={{ width: w, height: totalHeight + 22, marginTop: Math.max(84, height * 0.13), alignSelf: 'center' }}>
      <Svg width={w} height={totalHeight + 22} viewBox={`0 0 ${w} ${totalHeight + 22}`} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={`M0 26L26 0H${w}V${totalHeight}H${w/2+22}L${w/2} ${totalHeight+21}L${w/2-22} ${totalHeight}H0Z`} fill="#454850" stroke="#eef0f6" strokeWidth={1.5} />
      </Svg>
      <View style={{ height: totalHeight, padding: 18, paddingTop: 16 }}>
        <View style={{ minHeight: 57, paddingLeft: 36, paddingRight: 22, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#ffffff75', marginBottom: 10 }}>
          <Text numberOfLines={2} style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{diary?.author_profile?.nickname || (diary ? '이름 없는 별' : '별의 이야기')}</Text>
          {diary && <Text style={{ color: '#e0e3ec', fontSize: 11, marginTop: 4 }}>{new Date(diary.created_at).toLocaleDateString('ko-KR')}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="공유 일기 닫기" hitSlop={8} style={{ position: 'absolute', right: 10, top: 10 }} onPress={onClose}><Text style={{ color: '#fff', fontSize: 24 }}>×</Text></Pressable>
        {!current ? <ActivityIndicator color="#fff" accessibilityLabel="공유 일기 불러오는 중" />
          : current.error ? <View style={{ gap: 10 }}><Text style={styles.body}>{current.error}</Text><SpaceButton label="다시 불러오기" onPress={() => setAttempt(value => value + 1)} /></View>
          : diary && <ScrollView testID="shared-diary-body" nestedScrollEnabled showsVerticalScrollIndicator
              persistentScrollbar style={{ flex: 1 }} contentContainerStyle={{ paddingRight: 10, paddingBottom: 10 }} onContentSizeChange={(_, h) => setBodyHeight(h)}>
              <Text selectable style={styles.body}>{diary.content}</Text>
              {(diary.photo_urls ?? (diary.photo_url ? [diary.photo_url] : [])).map(uri => <Image key={uri} source={{ uri }} accessibilityLabel="일기에 첨부한 사진" style={{ width: '100%', height: 160, resizeMode: 'contain', marginTop: 12 }} />)}
            </ScrollView>}
      </View>
      <View style={{ position: 'absolute', left: -24, top: 10 }}><Avatar key={diary?.author_profile?.avatar_url} uri={diary?.author_profile?.avatar_url} size={70} /></View>
    </View>
  </View>;
}
const styles = StyleSheet.create({ overlay: { ...StyleSheet.absoluteFill, zIndex: 40, backgroundColor: '#0002' }, body: { color: '#f5f5f7', fontSize: 16, lineHeight: 25 } });
