import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UniverseCanvas } from '@/components/universe-scene';
import { goBackSafe } from '@/lib/navigation';
import { useDiary } from '@/store/diary-context';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, entries } = useDiary();
  const group = groups.find((g) => g.id === id);
  const groupEntries = entries.filter((e) => group?.diary_ids.includes(e.id));

  return (
    <View style={styles.container}>
      <UniverseCanvas entries={groupEntries} onStarPress={() => {}} />

      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.backButton} onPress={goBackSafe}>
          <Text style={styles.backButtonText}>{'‹ 목록으로'}</Text>
        </Pressable>
        <View style={styles.statsPill}>
          <Text style={styles.statsText}>
            {group ? group.name : '그룹'} (★ {groupEntries.length})
          </Text>
        </View>
      </View>

      {groupEntries.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyText}>아직 이 그룹에 공유된 별이 없어요.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050A' },
  topBar: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  backButtonText: { color: '#FFFFFF', fontWeight: '700' },
  statsPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statsText: { color: '#FFFFFF', fontWeight: '700' },
  emptyState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: { color: '#6E6E90', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
