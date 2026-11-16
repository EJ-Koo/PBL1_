import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ArchiveCardArt } from '@/components/ui/archive-card-art';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFontScale } from '@/hooks/use-font-scale';
import { DesignFonts } from '@/constants/ui-design';
import { ARCHIVE_QUARTERS, groupArchive } from '@/lib/diary-archive';
import { goBackSafe } from '@/lib/navigation';
import { useDiary } from '@/store/diary-context';

const dateLabel = (time: number) => new Date(time).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

export function DiaryHistory() {
  const { entries, dataLoading, loadError, retryLoad, isLoggedIn } = useDiary();
  const { period, entry: entryId, year } = useLocalSearchParams<{ period?: string; entry?: string; year?: string }>();
  const insets = useSafeAreaInsets();
  const [cardsHeight, setCardsHeight] = useState(480);
  const compact = cardsHeight < 390;
  const appFontScale = useFontScale();
  const { fontScale } = useWindowDimensions();
  const minCardHeight = 76 * Math.max(1, appFontScale * fontScale);
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { setNow(Date.now()); }, []));
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
  if (!isLoggedIn) return <View style={styles.screen} />;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.shell}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 화면으로" onPress={back} style={styles.button}><Text style={styles.text}>‹ 뒤로</Text></Pressable>
        <Text style={styles.telemetry}>STAR2DAY / PERSONAL LOG</Text>
      </View>
      <View style={styles.heading}>
        <View style={styles.headingRow}><Text accessibilityRole="header" style={styles.title}>OUR ARCHIVE</Text><Text style={styles.stripes}>▰▰▰</Text></View>
        <Text style={styles.eyebrow}>D I A R Y   A R C H I V E</Text>
      </View>
      {!period && <View style={styles.yearPicker}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 연도" disabled={selectedYear <= 100} accessibilityState={{ disabled: selectedYear <= 100 }} onPress={() => changeYear(-1)} style={[styles.yearArrow, selectedYear <= 100 && styles.disabled]}><Text style={styles.arrowText}>◀</Text></Pressable>
        <Text accessibilityLiveRegion="polite" accessibilityLabel={`${selectedYear}년`} style={styles.selectedYear}>{selectedYear}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 연도" disabled={selectedYear >= currentYear} accessibilityState={{ disabled: selectedYear >= currentYear }} onPress={() => changeYear(1)} style={[styles.yearArrow, selectedYear >= currentYear && styles.disabled]}><Text style={styles.arrowText}>▶</Text></Pressable>
      </View>}
      <Text style={styles.subtitle}>{group ? `${group.year} · ${ARCHIVE_QUARTERS[group.quarter - 1].label} / ${group.entries.length}개의 기록` : '지난 기록들을 3개월 단위로 모아볼 수 있어요.'}</Text>
      {dataLoading ? <ActivityIndicator color="#fff" accessibilityLabel="기록 불러오는 중" /> : loadError ? <View style={styles.message}>
        <Text style={styles.text}>{loadError}</Text><Pressable accessibilityRole="button" onPress={retryLoad} style={styles.button}><Text style={styles.text}>다시 시도</Text></Pressable>
      </View> : group?.locked ? <Text style={styles.message}>🔒 {dateLabel(group.unlockAt)}부터 열려요.</Text> : (period && !group) || (entryId && !selected) ? <Text style={styles.message}>기록을 찾을 수 없어요. 뒤로 가서 다시 선택해주세요.</Text> : selected ? (
        <ScrollView key={selected.id} contentContainerStyle={styles.content}>
          <Text style={styles.date}>{dateLabel(selected.createdAt)}</Text><Text selectable style={styles.body}>{selected.text}</Text>
          {selected.photos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.uri }} accessibilityLabel={`일기 사진 ${index + 1}`} resizeMode="contain" style={styles.photo} />)}
        </ScrollView>
      ) : group ? (
        <FlatList key={group.id} data={group.entries} keyExtractor={item => item.id} contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.message}>이 기간에 저장된 기록이 없어요.</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${dateLabel(item.createdAt)} 기록 보기`} onPress={() => router.push({ pathname: '/archive', params: { period, entry: item.id, year: String(selectedYear) } })} style={styles.entry}>
            <Text style={styles.date}>{dateLabel(item.createdAt)}  ›</Text><Text style={styles.body} numberOfLines={3}>{item.text}</Text>
            {item.photos.length > 0 && <Text style={styles.subtitle}>사진 {item.photos.length}장</Text>}
          </Pressable>} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.cards, { minHeight: 4 * minCardHeight + 38 }]} onLayout={e => setCardsHeight(e.nativeEvent.layout.height)}>
          {groups.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.year}년 ${item.quarter}분기, ${item.locked ? '잠김' : `기록 ${item.entries.length}개`}`} disabled={item.locked} accessibilityState={{ disabled: item.locked }} onPress={() => router.push({ pathname: '/archive', params: { period: item.id, year: String(selectedYear) } })} style={[styles.card, { minHeight: minCardHeight, maxHeight: Math.max(145, minCardHeight) }]}>
            <View style={StyleSheet.absoluteFill}><ArchiveCardArt index={index} locked={item.locked}/></View>
            <View style={styles.cardCopy}>
              <Text style={[styles.year, compact && {fontSize:10}]}>{item.year}</Text>
              <Text numberOfLines={1} style={[styles.period, compact && {fontSize:17}]}>{ARCHIVE_QUARTERS[item.quarter - 1].label}</Text>
              <Text style={[styles.range, compact && {fontSize:8, marginTop:4}]}>{ARCHIVE_QUARTERS[item.quarter - 1].range}</Text>
            </View>
            <View style={styles.countBadge}><Text numberOfLines={1} style={[styles.count, compact && {fontSize:7}]}>{item.locked ? `🔒 ${(item.quarter - 1) * 3 + 1}월 1일 열림` : `${item.entries.length} ENTRIES`}</Text></View>
          </Pressable>)}
        </ScrollView>
      )}
      <View style={styles.footer}><Text style={styles.stripes}>▰▰</Text><Text style={styles.footerLabel}>기록 아카이브</Text><Text style={styles.stripes}>▰▰</Text></View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  yearPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 6 },
  yearArrow: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#ddd', fontSize: 25 },
  selectedYear: { color: '#eee', fontFamily: DesignFonts.regular, fontSize: 25, minWidth: 76, textAlign: 'center' },
  disabled: { opacity: 0.25 },
  screen: { flex: 1, backgroundColor: '#050507' },
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
  content: { paddingBottom: 24 },
  cards: { flexGrow: 1, gap: 10, paddingBottom: 8 },
  card: { flex: 1, minHeight: 0, maxHeight: 145, overflow: 'hidden' },
  cardCopy: { position: 'absolute', top: '14%', left: '7%', width: '61%' },
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
