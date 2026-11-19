import { ScrollView } from '@/components/app-scroll-view';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { DiaryUniverse } from '@/components/diary-universe';
import { authSession } from '@/lib/auth-session';
import { ArchiveCardArt, ArchiveLockIcon } from '@/components/ui/archive-card-art';
import { ArchiveHeading } from '@/components/ui/archive-heading';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFontScale } from '@/hooks/use-font-scale';
import { DesignFonts } from '@/constants/ui-design';
import { ARCHIVE_QUARTERS, groupArchive } from '@/lib/diary-archive';
import { goBackSafe } from '@/lib/navigation';
import { getResponsiveLayout } from '@/lib/responsive-layout';
import { useDiary } from '@/store/diary-context';

const dateLabel = (time: number) => new Date(time).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

export function DiaryHistory() {
  const { entries, dataLoading, loadError, retryLoad, isLoggedIn } = useDiary();
  const { period, entry: entryId, year } = useLocalSearchParams<{ period?: string; entry?: string; year?: string }>();
  const insets = useSafeAreaInsets();
  const [cardsHeight, setCardsHeight] = useState(480);
  const appFontScale = useFontScale();
  const { width, height, fontScale } = useWindowDimensions();
  const availableWidth = Math.max(0, width - insets.left - insets.right);
  const { scale: headerScale } = getResponsiveLayout(width, height, insets);
  const wide = availableWidth >= 800;
  const compact = !wide && cardsHeight < 390;
  const contentWidth = Math.min(availableWidth, wide ? 1360 : 520) - (wide ? 80 : 40);
  const cardWidth = wide ? (contentWidth - 16) / 2 : contentWidth;
  const cardScale = wide ? Math.min(1.2, cardWidth / 400) : 1;
  const minCardHeight = 76 * Math.max(1, appFontScale * fontScale);
  const wideCardHeight = Math.max(100 * Math.max(1, appFontScale * fontScale), cardWidth / 4.3);
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { setNow(Date.now()); }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const date = new Date(now);
    const nextQuarter = new Date(date.getFullYear(), (Math.floor(date.getMonth() / 3) + 1) * 3, 1).getTime();
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(86400000, nextQuarter - Date.now())));
    return () => clearTimeout(timer);
  }, [now]);
  const currentYear = new Date(now).getFullYear();
  const requestedYear = Number(period?.split('-Q')[0] ?? year);
  const selectedYear = Number.isInteger(requestedYear) && requestedYear >= 100 && requestedYear <= 9999 ? requestedYear : currentYear;
  const groups = useMemo(() => groupArchive(entries, now, selectedYear), [entries, now, selectedYear]);
  const changeYear = (direction: number) => router.setParams({ year: String(selectedYear + direction), period: undefined, entry: undefined });
  const group = groups.find(item => item.id === period);
  const selected = group?.entries.find(item => item.id === entryId);
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (entryId) router.replace({ pathname: '/archive', params: { period, year: String(selectedYear) } });
    else if (period) router.replace({ pathname: '/archive', params: { year: String(selectedYear) } });
    else goBackSafe();
  };
  const renderCard = (item: typeof groups[number]) => <Pressable key={item.id} accessibilityRole="button"
    accessibilityLabel={`${item.year}년 ${item.quarter}분기, ${item.locked ? '잠김' : `기록 ${item.entries.length}개`}`}
    accessibilityHint={item.locked ? `${dateLabel(item.unlockAt)}부터 열려요.` : '해당 기간의 우주 보기'}
    disabled={item.locked} accessibilityState={{ disabled: item.locked }}
    onPress={() => router.push({ pathname: '/archive', params: { period: item.id, year: String(selectedYear) } })}
    style={({ pressed }) => [styles.card, wide ? { height: wideCardHeight } : { flex: 1, minHeight: minCardHeight, maxHeight: Math.max(145, minCardHeight) }, { opacity: pressed ? 0.75 : 1 }]}>
    <ArchiveCardArt index={item.quarter - 1} locked={item.locked} />
    <View style={[styles.cardCopy, item.locked && styles.lockedCopy]}>
      <Text style={[styles.year, { fontSize: (compact ? 10 : 12) * cardScale }]}>{item.year}</Text>
      <Text numberOfLines={1} style={[styles.period, { fontSize: (compact ? 17 : 21) * cardScale }]}>{ARCHIVE_QUARTERS[item.quarter - 1].label}</Text>
      <Text style={[styles.range, { fontSize: (compact ? 8 : 9) * cardScale, marginTop: (compact ? 4 : 9) * cardScale }]}>{ARCHIVE_QUARTERS[item.quarter - 1].range}</Text>
    </View>
    <View style={[styles.countBadge, item.locked && styles.lockedCopy]}>
      <Text numberOfLines={1} style={[styles.count, { fontSize: (compact ? 7 : 9) * cardScale }]}>
        {item.locked ? `${String((item.quarter - 1) * 3 + 1).padStart(2, '0')}.01 OPEN` : `${item.entries.length} ENTRIES`}
      </Text>
    </View>
    {item.locked && <View pointerEvents="none" style={styles.lock}><ArchiveLockIcon size={34 * cardScale} /></View>}
  </Pressable>;
  if (!isLoggedIn) return <View style={styles.screen} />;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <View style={[styles.shell, wide && { maxWidth: 1360, paddingHorizontal: 40, paddingTop: 8 * headerScale }]}>
      <View style={[styles.topbar, wide && { minHeight: 44 * headerScale }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 화면으로" onPress={back} style={styles.button}><Text style={[styles.text, wide && { fontSize: 16 * headerScale }]}>‹ 뒤로</Text></Pressable>
        <Text style={[styles.telemetry, wide && { fontSize: 10 * headerScale }]}>STAR2DAY / PERSONAL LOG</Text>
      </View>
      <ArchiveHeading width={contentWidth} wide={wide} scale={headerScale} />
      {!period && <View style={[styles.yearPicker, wide && { marginTop: 8 * headerScale, gap: 12 * headerScale }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 연도" disabled={selectedYear <= 100} accessibilityState={{ disabled: selectedYear <= 100 }} onPress={() => changeYear(-1)} style={[styles.yearArrow, selectedYear <= 100 && styles.disabled]}><Text style={[styles.arrowText, wide && { fontSize: 18 * headerScale }]}>◀</Text></Pressable>
        <Text accessibilityLiveRegion="polite" accessibilityLabel={`${selectedYear}년`} style={[styles.selectedYear, wide && { fontSize: 20 * headerScale }]}>{selectedYear}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 연도" disabled={selectedYear >= currentYear} accessibilityState={{ disabled: selectedYear >= currentYear }} onPress={() => changeYear(1)} style={[styles.yearArrow, selectedYear >= currentYear && styles.disabled]}><Text style={[styles.arrowText, wide && { fontSize: 18 * headerScale }]}>▶</Text></Pressable>
      </View>}
      {(!wide || period) && <Text style={styles.subtitle}>{group ? `${group.year} · ${ARCHIVE_QUARTERS[group.quarter - 1].label} / ${group.entries.length}개의 기록` : '지난 기록들을 3개월 단위로 모아볼 수 있어요.'}</Text>}
      {dataLoading ? <ActivityIndicator color="#fff" accessibilityLabel="기록 불러오는 중" /> : loadError ? <View style={styles.message}>
        <Text style={styles.text}>{loadError}</Text><Pressable accessibilityRole="button" onPress={retryLoad} style={styles.button}><Text style={styles.text}>다시 시도</Text></Pressable>
      </View> : group?.locked ? <Text style={styles.message}>🔒 {dateLabel(group.unlockAt)}부터 열려요.</Text> : (period && !group) || (entryId && !selected) ? <Text style={styles.message}>기록을 찾을 수 없어요. 뒤로 가서 다시 선택해주세요.</Text> : selected ? (
        <ScrollView key={selected.id} contentContainerStyle={styles.content}>
          <Text style={styles.date}>{dateLabel(selected.createdAt)}</Text><Text selectable style={styles.body}>{selected.text}</Text>
          {selected.photos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.uri }} accessibilityLabel={`일기 사진 ${index + 1}`} resizeMode="contain" style={styles.photo} />)}
        </ScrollView>
      ) : group ? (
        <View key={group.id} style={styles.universe}>
          <DiaryUniverse
            entries={group.entries}
            sceneKey={`${authSession.getRevision()}:archive-${group.id}`}
            popupInsets={{ top: 16, bottom: 56 }}
          />
          <View pointerEvents="none" style={styles.universeHint}>
            <Text style={styles.hintText}>{group.entries.length ? '드래그해서 둘러보고, 행성을 눌러 기록을 확인하세요.' : '이 기간에 저장된 기록이 없어요.'}</Text>
          </View>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={wide ? styles.wideCards : [styles.cards, { minHeight: 4 * minCardHeight + 38 }]}
          onLayout={e => setCardsHeight(e.nativeEvent.layout.height)}>
          {wide ? <View style={styles.cardGrid}>
            <View style={styles.cardColumn}>{groups.slice(0, 2).map(renderCard)}</View>
            <View style={styles.cardColumn}>{groups.slice(2, 4).map(renderCard)}</View>
          </View> : groups.map(renderCard)}
        </ScrollView>
      )}
      {!wide && <View style={styles.footer}><Text style={styles.stripes}>▰▰</Text><Text style={styles.footerLabel}>기록 아카이브</Text><Text style={styles.stripes}>▰▰</Text></View>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  yearPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 6 },
  yearArrow: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#ddd', fontSize: 25 },
  selectedYear: { color: '#eee', fontFamily: DesignFonts.regular, fontSize: 25, minWidth: 76, textAlign: 'center' },
  disabled: { opacity: 0.25 },
  screen: { flex: 1, backgroundColor: '#000' },
  shell: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 20 },
  text: { color: '#eee', fontFamily: DesignFonts.regular, fontSize: 16 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#55565e', paddingVertical: 2, gap: 12 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  telemetry: { color: '#999ba5', fontSize: 9, letterSpacing: 1, flexShrink: 1 },
  heading: { borderWidth: 1, borderColor: '#92949d', padding: 10, marginTop: 12 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { color: '#f1f1f3', fontFamily: DesignFonts.bold, fontSize: 21, letterSpacing: -0.8, flexShrink: 1 },
  stripes: { color: '#d3d4da', fontSize: 20 },
  eyebrow: { color: '#9b9ca8', fontSize: 9, marginTop: 8 },
  subtitle: { color: '#b5b5bf', fontSize: 12, lineHeight: 20, marginVertical: 8 },
  universe: { flex: 1, minHeight: 0, position: 'relative' },
  universeHint: { position: 'absolute', bottom: 12, left: 12, right: 12, alignItems: 'center' },
  hintText: { color: '#b5b5bf', fontSize: 12, lineHeight: 20, textAlign: 'center', backgroundColor: '#050507cc', padding: 8 },
  content: { paddingBottom: 24 },
  cards: { flexGrow: 1, gap: 10, paddingBottom: 8 },
  wideCards: { flexGrow: 1, justifyContent: 'center', paddingTop: 24, paddingBottom: 80 },
  cardGrid: { flexDirection: 'row', gap: 16 },
  cardColumn: { flex: 1, minWidth: 0, gap: 16 },
  card: { minHeight: 0, overflow: 'hidden' },
  cardCopy: { position: 'absolute', top: '14%', left: '7%', width: '61%' },
  lockedCopy: { opacity: 0.3 },
  lock: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  countBadge: { position: 'absolute', right: '8%', bottom: '8%', width: '23%', alignItems: 'center' },
  year: { color: '#d7d8df', fontSize: 12, marginBottom: 3 },
  period: { color: '#fff', fontSize: 21, fontFamily: DesignFonts.bold, letterSpacing: 1 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  range: { color: '#b2b4c3', fontSize: 9, letterSpacing: 1, marginTop: 9 },
  count: { color: '#e1e1e9', fontSize: 9, letterSpacing: 1 },
  entry: { borderWidth: 1, borderColor: '#555762', backgroundColor: '#101118', padding: 20, marginBottom: 14 },
  date: { color: '#eee', fontSize: 16, fontWeight: '700', marginBottom: 18 },
  body: { color: '#dddde6', fontFamily: DesignFonts.regular, fontSize: 16, lineHeight: 28 },
  photo: { width: '100%', height: 260, marginTop: 18 },
  message: { color: '#ccc', paddingVertical: 32, lineHeight: 28, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#777', paddingVertical: 8, gap: 12 },
  footerLabel: { color: '#eee', backgroundColor: '#55565d', borderWidth: 1, borderColor: '#aaa', paddingHorizontal: 28, paddingVertical: 8, fontSize: 11 },
});
