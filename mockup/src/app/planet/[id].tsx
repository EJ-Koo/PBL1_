import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { goBackSafe } from '@/lib/navigation';
import { useDiary, type Visibility } from '@/store/diary-context';

const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: '전체공개',
  friends: '친구에게만 공개',
  private: '공개안함',
};

export default function PlanetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getEntry, isEditableToday } = useDiary();
  const entry = getEntry(id);

  if (!entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFoundText}>기록을 찾을 수 없습니다.</Text>
        <Pressable onPress={goBackSafe}>
          <Text style={styles.backLink}>← 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const date = new Date(entry.createdAt);
  const dateLabel = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  const editable = isEditableToday(entry.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={goBackSafe}>
        <Text style={styles.backLink}>← 우주로</Text>
      </Pressable>

      <View style={styles.planetHeader}>
        <View style={[styles.planet, { backgroundColor: entry.color }]} />
        <Text style={styles.dateLabel}>{dateLabel}</Text>
        <View style={styles.visibilityBadge}>
          <Text style={styles.visibilityBadgeText}>{VISIBILITY_LABELS[entry.visibility]}</Text>
        </View>
      </View>

      {entry.photoUri && (
        <Image source={{ uri: entry.photoUri }} style={styles.photo} />
      )}

      <Text style={styles.text}>{entry.text}</Text>

      <View style={styles.analysisBox}>
        <Text style={styles.analysisTitle}>AI 분석 (목업)</Text>
        <Text style={styles.analysisText}>감정·의미 분석 결과가 이 영역에 표시될 예정입니다.</Text>
      </View>

      <Pressable
        style={[styles.editButton, !editable && styles.editButtonDisabled]}
        onPress={() => editable && router.push(`/write?id=${entry.id}`)}
        disabled={!editable}
      >
        <Text style={[styles.editButtonText, !editable && styles.editButtonTextDisabled]}>
          수정
        </Text>
      </Pressable>
      {!editable && (
        <Text style={styles.editHint}>작성한 날에만 수정할 수 있어요.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 20,
  },
  backLink: {
    color: '#9C9CC0',
    fontSize: 14,
  },
  planetHeader: {
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  planet: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  dateLabel: {
    color: '#8888AA',
    fontSize: 13,
  },
  visibilityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#14142A',
    borderWidth: 1,
    borderColor: '#2A2A45',
  },
  visibilityBadgeText: {
    color: '#9C9CC0',
    fontSize: 11,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  text: {
    color: '#E4E4F0',
    fontSize: 16,
    lineHeight: 24,
  },
  analysisBox: {
    borderWidth: 1,
    borderColor: '#2A2A45',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#14142A',
    gap: 6,
  },
  analysisTitle: {
    color: '#7C6CF6',
    fontSize: 13,
    fontWeight: '700',
  },
  analysisText: {
    color: '#6E6E90',
    fontSize: 13,
    lineHeight: 18,
  },
  editButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#7C6CF6',
  },
  editButtonDisabled: {
    backgroundColor: '#1C1C33',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  editButtonTextDisabled: {
    color: '#4A4A6A',
  },
  editHint: {
    color: '#5F5F80',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -12,
  },
  notFoundText: {
    color: '#9C9CC0',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 100,
    marginBottom: 12,
  },
});
