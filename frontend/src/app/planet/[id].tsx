import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { PlanetDetailView } from '@/components/planet-detail-view';
import { PlanetDetailBackground } from '@/components/ui/planet-detail-decoration';
import { KoreanFonts } from '@/constants/ui-design';
import { apiReadDiary } from '@/lib/api';
import { authSession } from '@/lib/auth-session';
import { useLanguage } from '@/lib/language';
import { goBackSafe } from '@/lib/navigation';
import { useDiary, toEntry, type DiaryEntry } from '@/store/diary-context';

export default function PlanetDetailScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const { t } = useLanguage();
  const { getEntry, isOwnEntry, isEditableToday, isRestoring, dataLoading, accessToken } = useDiary();
  const cached = getEntry(id, groupId);
  const revision = authSession.getRevision();
  const [remote, setRemote] = useState<{ id: string; revision: number; attempt: number; entry: DiaryEntry | null; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  // Revalidate shared diaries, including after their group access is revoked.
  useFocusEffect(useCallback(() => {
    if (!accessToken || !groupId) return;
    let alive = true;
    apiReadDiary(accessToken, id).then(diary => {
      if (!alive || authSession.getRevision() !== revision) return;
      setRemote({ id, revision, attempt: retry, entry: toEntry(diary, 0), error: null });
    }).catch(error => {
      if (alive && authSession.getRevision() === revision) setRemote({ id, revision, attempt: retry, entry: null, error: error instanceof Error ? error.message : t('기록을 불러오지 못했어요.') });
    });
    return () => { alive = false; };
  }, [accessToken, groupId, id, revision, retry, t]));
  const verified = remote?.id === id && remote.revision === revision && remote.attempt === retry ? remote : null;
  const entry = groupId ? (verified?.entry ? { ...verified.entry, planet: cached?.planet ?? verified.entry.planet, effect: cached?.effect ?? verified.entry.effect } : null) : cached;
  const goToUniverse = () => {
    if (router.canGoBack()) router.back();
    else if (groupId) router.replace({ pathname: '/', params: { groupId } });
    else goBackSafe();
  };
  const owned = isOwnEntry(id);
  const [previewVisible, setPreviewVisible] = useState(false);
  useFocusEffect(useCallback(() => {
    setPreviewVisible(true);
    return () => setPreviewVisible(false);
  }, []));

  if (isRestoring || dataLoading || (groupId && !verified)) return <View style={styles.screen}>
    <PlanetDetailBackground />
    <View style={styles.message}><ActivityIndicator color="#b7caf1" /><Text style={styles.text}>{t('기록을 불러오는 중…')}</Text></View>
  </View>;
  if (!entry) return <View style={styles.screen}>
    <PlanetDetailBackground />
    <View style={styles.message}>
      <Text accessibilityRole="alert" style={styles.text}>{verified?.error ?? t('기록을 찾을 수 없습니다.')}</Text>
      {groupId && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.link}>
        <Text style={styles.text}>{t('다시 불러오기')}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" onPress={goToUniverse} style={styles.link}>
        <Text style={styles.text}>← {t('돌아가기')}</Text>
      </Pressable>
    </View>
  </View>;

  const editable = owned && isEditableToday(entry.id);
  return <PlanetDetailView key={entry.id} entry={entry} owned={owned} editable={editable}
    previewVisible={previewVisible} group={!!groupId} onBack={goToUniverse}
    onEdit={() => { if (editable) router.push(`/write?id=${entry.id}`); }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080a16' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  text: { color: '#aaa5c7', fontFamily: KoreanFonts.regular, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  link: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
});
