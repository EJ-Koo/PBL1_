// 일기 검색 화면 (/search 경로. 메뉴 맨 위 "일기 검색"을 누르면 열림).
// 팝업이 아니라 독립 화면이라, 결과를 눌러 행성 상세로 갔다가 뒤로 오면 검색어·결과가 그대로 남는다.
// 위: 키워드 검색 / 아래: 달력(날짜) 검색. 둘 다 쓰면 두 조건을 모두 만족하는 일기만 보여준다.
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SearchCalendar } from '@/components/search-calendar';
import {
  addRecentKeyword,
  clearRecentKeywords,
  formatDateKey,
  loadRecentKeywords,
  makeSnippet,
  removeRecentKeyword,
  searchEntries,
  toDateKey,
} from '@/lib/search';
import { useDiary } from '@/store/diary-context';

type Props = {
  onBack: () => void;
  onOpenEntry: (id: string) => void;
};

export function SearchScreen({ onBack, onOpenEntry }: Props) {
  const { entries } = useDiary();
  const [keyword, setKeyword] = useState('');
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  // 기기에 저장된 최근 검색어를 처음 열 때 한 번 불러온다.
  useEffect(() => {
    let alive = true;
    loadRecentKeywords().then((list) => {
      if (alive) setRecent([...list]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const markedDays = useMemo(() => new Set(entries.map((e) => toDateKey(e.createdAt))), [entries]);
  const isSearching = keyword.trim().length > 0 || dateKey !== null;
  const results = useMemo(
    () => (isSearching ? searchEntries(entries, keyword, dateKey) : []),
    [entries, keyword, dateKey, isSearching]
  );

  // 최근 검색어는 엔터를 치거나 결과를 눌렀을 때만 저장한다 (입력 중간 글자가 쌓이지 않도록).
  const saveKeyword = () => setRecent([...addRecentKeyword(keyword)]);

  const openEntry = (id: string) => {
    saveKeyword();
    onOpenEntry(id);
  };

  return (
    <View style={styles.screen}>
      {/* 모니터처럼 넓은 화면에서는 가로로 너무 늘어나지 않게 최대 폭을 두고 가운데 정렬 */}
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={10}>
            <Text style={styles.backText}>‹  나의 우주</Text>
          </Pressable>
          <Text style={styles.title}>일기 검색</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* 위: 키워드 검색 */}
        <View style={styles.box}>
          <Text style={styles.boxIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="키워드 검색"
            placeholderTextColor="#6E6E90"
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={saveKeyword}
            returnKeyType="search"
            autoFocus
          />
          {keyword.length > 0 && (
            <Pressable onPress={() => setKeyword('')} hitSlop={10}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* 아래: 달력(날짜) 검색 */}
        <Pressable style={styles.box} onPress={() => setCalendarOpen((v) => !v)}>
          <Text style={styles.boxIcon}>📅</Text>
          <Text style={[styles.dateText, !dateKey && styles.placeholder]}>
            {dateKey ? formatDateKey(dateKey) : '날짜 검색'}
          </Text>
          {dateKey ? (
            <Pressable
              onPress={() => {
                setDateKey(null);
                setCalendarOpen(false);
              }}
              hitSlop={10}
            >
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : (
            <Text style={styles.clearText}>{calendarOpen ? '▴' : '▾'}</Text>
          )}
        </Pressable>

        {calendarOpen && (
          <SearchCalendar
            markedDays={markedDays}
            selected={dateKey}
            onSelect={(key) => {
              setDateKey(key);
              setCalendarOpen(false);
            }}
          />
        )}

        {isSearching ? (
          <FlatList
            style={styles.list}
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={<Text style={styles.sectionTitle}>검색 결과 {results.length}개</Text>}
            ListEmptyComponent={<Text style={styles.emptyText}>찾는 일기가 없어요.</Text>}
            renderItem={({ item }) => {
              const s = makeSnippet(item.text, keyword);
              return (
                <Pressable style={styles.resultRow} onPress={() => openEntry(item.id)}>
                  <View style={[styles.planetDot, { backgroundColor: item.color }]} />
                  <View style={styles.resultBody}>
                    <Text style={styles.resultDate}>{formatDateKey(toDateKey(item.createdAt))}</Text>
                    <Text style={styles.resultText} numberOfLines={2}>
                      {s.before}
                      {s.match ? <Text style={styles.highlight}>{s.match}</Text> : null}
                      {s.after}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        ) : (
          !calendarOpen && (
            <View style={styles.list}>
              <View style={styles.recentHeader}>
                <Text style={styles.sectionTitle}>최근 검색어</Text>
                {recent.length > 0 && (
                  <Pressable onPress={() => setRecent([...clearRecentKeywords()])} hitSlop={8}>
                    <Text style={styles.clearAllText}>전체 삭제</Text>
                  </Pressable>
                )}
              </View>
              {recent.length === 0 ? (
                <Text style={styles.emptyText}>최근 검색어가 없어요.</Text>
              ) : (
                recent.map((r) => (
                  <View key={r} style={styles.recentRow}>
                    <Pressable style={styles.recentWord} onPress={() => setKeyword(r)}>
                      <Text style={styles.recentText}>{r}</Text>
                    </Pressable>
                    <Pressable onPress={() => setRecent([...removeRecentKeyword(r)])} hitSlop={10}>
                      <Text style={styles.clearText}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05050A',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backText: { color: '#9C9CC0', fontSize: 15 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 70 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#7F8C8D',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: '#0E0E18',
  },
  boxIcon: { fontSize: 16 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15, padding: 0 },
  dateText: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  placeholder: { color: '#6E6E90' },
  clearText: { color: '#9C9CC0', fontSize: 15 },
  list: { flex: 1, marginTop: 10 },
  sectionTitle: { color: '#9C9CC0', fontSize: 13, marginBottom: 10 },
  emptyText: { color: '#6E6E90', fontSize: 14, textAlign: 'center', marginTop: 30 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  planetDot: { width: 14, height: 14, borderRadius: 7 },
  resultBody: { flex: 1 },
  resultDate: { color: '#9C9CC0', fontSize: 12, marginBottom: 4 },
  resultText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  highlight: { color: '#111111', backgroundColor: '#DCDDE1', fontWeight: '700' },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clearAllText: { color: '#9C9CC0', fontSize: 13, marginBottom: 10 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  recentWord: { flex: 1 },
  recentText: { color: '#FFFFFF', fontSize: 14 },
});
