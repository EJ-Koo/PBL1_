import { Text, TextInput } from '@/components/app-text';
// Shared by the diary-search popup and the /search route.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Keyboard, Pressable, StyleSheet, View, type ViewToken } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SearchResultPlanet } from '@/components/ui/search-result-planet';
import { recentSearchLabel, type RecentSearch, type SearchQuery } from '@/lib/search-history';
import { SearchCalendar } from '@/components/search-calendar';
import { DesignFonts } from '@/constants/ui-design';
import { addRecentSearch, clearRecentSearches, formatDateKey, loadRecentSearches, makeSnippet,
  removeRecentSearch, searchEntries, toDateKey } from '@/lib/search';
import { useDiary, type DiaryEntry } from '@/store/diary-context';

const PREVIEW_VIEWABILITY = { itemVisiblePercentThreshold: 10 };

type Props = { onBack: () => void; onOpenEntry: (id: string) => void; initialCalendarOpen?: boolean; embedded?: boolean };

function SearchSymbol({ calendar = false }: { calendar?: boolean }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" pointerEvents="none">
    {calendar ? <Path d="M5 5H19V20H5Z M5 10H19 M9 2V7 M15 2V7" stroke="#c9d0da" fill="none" strokeWidth={1.4} />
      : <><Circle cx={10} cy={10} r={6} stroke="#c9d0da" fill="none" strokeWidth={1.4} /><Path d="M15 15L21 21" stroke="#c9d0da" strokeWidth={1.4} /></>}
  </Svg>;
}
export function SearchScreen({ onBack, onOpenEntry, initialCalendarOpen = false, embedded = false }: Props) {
  const { entries } = useDiary();
  const [keyword, setKeyword] = useState('');
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(initialCalendarOpen);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const pendingHistory = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);
  const [onViewableItemsChanged] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<DiaryEntry>[] }) => {
    setVisibleIds(new Set(viewableItems.filter(token => token.isViewable).map(token => token.item.id)));
  });
  const cancelPendingHistory = () => {
    if (pendingHistory.current !== null) clearTimeout(pendingHistory.current);
    pendingHistory.current = null;
  };
  // Filtering is already live. Save a settled query without dismissing the
  // keyboard now that the explicit search button has been removed.
  useEffect(() => {
    if (!keyword.trim() && !dateKey) return;
    let alive = true;
    const timer = setTimeout(() => {
      pendingHistory.current = null;
      void addRecentSearch({ keyword, dateKey }).then(history => { if (alive) setRecent(history); });
    }, 700);
    pendingHistory.current = timer;
    return () => {
      alive = false;
      clearTimeout(timer);
      if (pendingHistory.current === timer) pendingHistory.current = null;
    };
  }, [keyword, dateKey]);
  useEffect(() => {
    let alive = true;
    loadRecentSearches().then(list => { if (alive) setRecent([...list]); });
    return () => { alive = false; };
  }, []);
  const markedDays = useMemo(() => new Set(entries.map(entry => toDateKey(entry.createdAt))), [entries]);
  const isSearching = keyword.trim().length > 0 || dateKey !== null;
  const results = useMemo(() => {
    const matches = searchEntries(entries, keyword, dateKey);
    return isSearching ? matches : matches.slice(0, 5);
  }, [entries, keyword, dateKey, isSearching]);
  const saveSearch = async (query: SearchQuery = { keyword, dateKey }) => {
    cancelPendingHistory();
    Keyboard.dismiss();
    setRecent(await addRecentSearch(query));
  };
  const restoreSearch = (query: SearchQuery) => {
    setKeyword(query.keyword);
    setDateKey(query.dateKey);
    setCalendarOpen(false);
    void saveSearch(query);
  };

  return <View style={embedded ? styles.embeddedScreen : styles.screen}>
    <View style={embedded ? styles.embeddedContainer : styles.container}>
      {!embedded && <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10}><Text style={styles.backText}>‹ 나의 우주</Text></Pressable>
        <Text style={styles.title}>일기 검색</Text><View style={{ width: 70 }} />
      </View>}
      <FlatList style={styles.list} contentContainerStyle={styles.listContent}
        data={results} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
        extraData={visibleIds} onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={PREVIEW_VIEWABILITY}
        initialNumToRender={5} maxToRenderPerBatch={5} windowSize={3}
        ListHeaderComponent={<>
          <View style={styles.box}>
            <SearchSymbol />
            <TextInput accessibilityLabel="일기 키워드 검색" style={styles.input} placeholder="키워드 검색" placeholderTextColor="#8b94a3"
              value={keyword} onChangeText={setKeyword} onSubmitEditing={() => { void saveSearch(); }} returnKeyType="search" />
            {!!keyword && <Pressable accessibilityLabel="검색어 지우기" onPress={() => setKeyword('')} hitSlop={8}><Text style={styles.clearText}>×</Text></Pressable>}
          </View>
          <View style={styles.box}>
            <SearchSymbol calendar />
            <Pressable accessibilityRole="button" accessibilityLabel="날짜 검색 달력" accessibilityState={{ expanded: calendarOpen }}
              style={styles.dateButton} onPress={() => { Keyboard.dismiss(); setCalendarOpen(open => !open); }}>
              <Text style={[styles.dateText, !dateKey && styles.placeholder]}>{dateKey ? formatDateKey(dateKey) : '날짜 검색'}</Text>
              <Text style={styles.clearText}>{calendarOpen ? '▴' : '▾'}</Text>
            </Pressable>
            {!!dateKey && <Pressable accessibilityLabel="날짜 조건 지우기" onPress={() => { setDateKey(null); setCalendarOpen(false); }} hitSlop={8}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>}
          </View>
          {calendarOpen && <View style={styles.calendar}><SearchCalendar markedDays={markedDays} selected={dateKey}
            onSelect={key => { setDateKey(key); setCalendarOpen(false); void saveSearch({ keyword, dateKey: key }); }} /></View>}
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}><Text style={styles.sectionTitle}>최근 검색어</Text>
              {recent.length > 0 && <Pressable accessibilityRole="button" onPress={() => { cancelPendingHistory(); void clearRecentSearches().then(setRecent); }} hitSlop={8}>
                <Text style={styles.clearAllText}>전체 삭제</Text>
              </Pressable>}
            </View>
            {recent.length === 0 ? <Text style={styles.recentEmpty}>최근 검색어가 없어요.</Text> : <View style={styles.chips}>
              {recent.map(query => <View key={query.id} style={styles.chip}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${recentSearchLabel(query)} 검색`} onPress={() => restoreSearch(query)} style={styles.chipWord}>
                  <Text style={styles.chipText} numberOfLines={1}>{recentSearchLabel(query)}</Text>
                </Pressable>
                <Pressable accessibilityLabel={`${recentSearchLabel(query)} 최근 검색어 삭제`} onPress={() => { cancelPendingHistory(); void removeRecentSearch(query.id).then(setRecent); }} style={styles.chipRemove}>
                  <Text style={styles.chipClose}>×</Text>
                </Pressable>
              </View>)}
            </View>}
          </View>
          <Text style={styles.resultHeading}>{isSearching ? `검색 결과 ${results.length}개` : '최근 일기'}</Text>
        </>}
        ListEmptyComponent={<Text style={styles.emptyText}>{isSearching ? '조건에 맞는 일기가 없어요.' : '아직 작성한 일기가 없어요.'}</Text>}
        renderItem={({ item, index }) => {
          const snippet = makeSnippet(item.text, keyword);
          const title = item.text.trim().split(/\r?\n/)[0];
          return <Pressable accessibilityRole="button" accessibilityLabel={`${formatDateKey(toDateKey(item.createdAt))}, ${title}`}
            style={({ pressed }) => [styles.resultRow, pressed && styles.resultPressed]}
            onPress={() => { void saveSearch(); onOpenEntry(item.id); }}>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
              <Svg width="100%" height="100%" viewBox="0 0 400 82" preserveAspectRatio="none">
                <Path d="M8 1H392L399 8V74L392 81H8L1 74V8Z" fill="#0c111a" stroke="#c8cdd5" strokeWidth="1" />
                <Path d="M9 4H60 M340 78H390" stroke="#fff" strokeWidth="1" />
              </Svg>
            </View>
            <SearchResultPlanet entry={item} active={visibleIds ? visibleIds.has(item.id) : index < 5} />
            <View style={styles.resultBody}>
              <Text style={styles.resultDate}>{toDateKey(item.createdAt).replaceAll('-', '.')}</Text>
              <Text style={styles.resultTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.resultText} numberOfLines={1}>{snippet.before}
                {snippet.match ? <Text style={styles.highlight}>{snippet.match}</Text> : null}{snippet.after}
              </Text>
            </View>
            {!!item.photoUri && <Image source={{ uri: item.photoUri }} style={styles.thumbnail} />}
          </Pressable>;
        }} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  embeddedScreen: { flex: 1, minHeight: 0 }, embeddedContainer: { flex: 1, minHeight: 0, width: '100%' },
  screen: { flex: 1, backgroundColor: '#05070c', alignItems: 'center' },
  container: { flex: 1, width: '100%', maxWidth: 560, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backText: { color: '#bec6d4', fontSize: 13 }, title: { color: '#fff', fontFamily: DesignFonts.bold, fontSize: 18 },
  list: { flex: 1, minHeight: 0 }, listContent: { paddingTop: 4, paddingBottom: 12 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderWidth: 1, borderColor: '#8d96a4',
    borderRadius: 4, paddingHorizontal: 10, marginBottom: 10, backgroundColor: '#0b1018' },
  input: { flex: 1, minWidth: 0, color: '#f1f3f8', fontSize: 14, padding: 0, paddingVertical: 0, height: '100%' },
  dateButton: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { flex: 1, color: '#edf0f6', fontSize: 14 }, placeholder: { color: '#8b94a3' }, clearText: { color: '#c5cbd5', fontSize: 18 },
  calendar: { marginBottom: 4 }, recentSection: { marginTop: 10, marginBottom: 18 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: '#d5dae3', fontFamily: DesignFonts.bold, fontSize: 12 }, clearAllText: { color: '#919bab', fontSize: 10 },
  recentEmpty: { color: '#818c9c', fontSize: 11, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#6d7582', borderRadius: 4, backgroundColor: '#141a22' },
  chipWord: { flexShrink: 1, paddingLeft: 10, paddingRight: 5, paddingVertical: 9 }, chipText: { color: '#e1e5ed', fontSize: 11 },
  chipRemove: { paddingHorizontal: 7, paddingVertical: 5 }, chipClose: { color: '#a8b0bc', fontSize: 14 },
  resultHeading: { color: '#b2bbc8', fontFamily: DesignFonts.bold, fontSize: 12, marginBottom: 12 },
  resultRow: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 10, marginBottom: 10 },
  resultPressed: { opacity: 0.7 }, resultBody: { flex: 1, minWidth: 0, zIndex: 1 },
  resultDate: { color: '#9da6b4', fontSize: 10, marginBottom: 3 }, resultTitle: { color: '#f1f3f7', fontFamily: DesignFonts.bold, fontSize: 13, marginBottom: 3 },
  resultText: { color: '#aeb7c4', fontSize: 11, lineHeight: 16 }, highlight: { color: '#fff', fontWeight: '700', backgroundColor: '#45526b' },
  thumbnail: { width: 40, height: 40, borderRadius: 3, zIndex: 1 }, emptyText: { color: '#8c98a9', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
