import { useEffect } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDiary, type DiaryEntry } from '@/store/diary-context';

export default function HomeScreen() {
  const { isLoggedIn, entries } = useDiary();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <View style={styles.container} />;
  }

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
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
    paddingTop: 60,
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
    shadowColor: '#7C6CF6',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
  },
});
