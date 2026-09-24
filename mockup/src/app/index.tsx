import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useDiary, type DiaryEntry } from '@/store/diary-context';

const { width, height } = Dimensions.get('window');
const PAGE_LABELS = ['상점', '나의 우주', '퀘스트'];

export default function HomeScreen() {
  const { isLoggedIn } = useDiary();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(1);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn]);

  useEffect(() => {
    // 가운데(나의 우주) 페이지에서 시작
    scrollRef.current?.scrollTo({ x: width, y: 0, animated: false });
  }, []);

  if (!isLoggedIn) {
    return <View style={styles.container} />;
  }

  const goToPage = (index: number) => {
    scrollRef.current?.scrollTo({ x: width * index, y: 0, animated: true });
    setPageIndex(index);
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setPageIndex(index);
  };

  return (
    <View style={styles.pagerWrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: width, y: 0 }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
      >
        <View style={{ width, height }}>
          <PlaceholderPage label="상점" />
        </View>
        <View style={{ width, height }}>
          <UniversePage />
        </View>
        <View style={{ width, height }}>
          <PlaceholderPage label="퀘스트" />
        </View>
      </ScrollView>

      {/* PC 웹은 마우스로 좌우 스와이프가 안 되므로, 클릭으로도 이동 가능하게 보조 버튼 제공 */}
      <View style={styles.dotsRow} pointerEvents="box-none">
        {PAGE_LABELS.map((label, index) => (
          <Pressable key={label} style={styles.dotButton} onPress={() => goToPage(index)}>
            <View style={[styles.dot, pageIndex === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PlaceholderPage({ label }: { label: string }) {
  return (
    <View style={styles.placeholderContainer}>
      <Text style={styles.placeholderLabel}>{label}</Text>
    </View>
  );
}

function UniversePage() {
  const { entries } = useDiary();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>나의 우주</Text>
        <Text style={styles.headerSubtitle}>{entries.length}개의 행성</Text>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>아직 기록이 없어요.{'\n'}첫 행성을 만들어보세요.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <PlanetItem entry={item} />}
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push('/write')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

function PlanetItem({ entry }: { entry: DiaryEntry }) {
  const date = new Date(entry.createdAt);
  const label = `${date.getMonth() + 1}/${date.getDate()}`;

  return (
    <Pressable style={styles.planetWrap} onPress={() => router.push(`/planet/${entry.id}`)}>
      <View style={[styles.planet, { backgroundColor: entry.color }]} />
      <Text style={styles.planetLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pagerWrap: {
    flex: 1,
    backgroundColor: '#0B0B1A',
  },
  pager: {
    flex: 1,
    backgroundColor: '#0B0B1A',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dotButton: {
    padding: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3A3A5A',
  },
  dotActive: {
    backgroundColor: '#7C6CF6',
    width: 18,
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
    paddingTop: 60,
  },
  placeholderContainer: {
    flex: 1,
    backgroundColor: '#0B0B1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLabel: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#9C9CC0',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#6E6E90',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  grid: {
    paddingHorizontal: 16,
    gap: 20,
  },
  planetWrap: {
    flex: 1 / 3,
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  planet: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  planetLabel: {
    color: '#8888AA',
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 40,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7C6CF6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: '0px 0px 12px rgba(124, 108, 246, 0.5)' },
      default: {
        shadowColor: '#7C6CF6',
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
    }),
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
  },
});
