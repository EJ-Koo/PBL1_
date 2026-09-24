import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDiary } from '@/store/diary-context';

export default function PlanetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getEntry } = useDiary();
  const entry = getEntry(id);

  if (!entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFoundText}>기록을 찾을 수 없습니다.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>← 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const date = new Date(entry.createdAt);
  const dateLabel = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.backLink}>← 우주로</Text>
      </Pressable>

      <View style={styles.planetHeader}>
        <View style={[styles.planet, { backgroundColor: entry.color }]} />
        <Text style={styles.dateLabel}>{dateLabel}</Text>
      </View>

      {entry.photoUri && (
        <Image source={{ uri: entry.photoUri }} style={styles.photo} />
      )}

      <Text style={styles.text}>{entry.text}</Text>

      <View style={styles.analysisBox}>
        <Text style={styles.analysisTitle}>AI 분석 (목업)</Text>
        <Text style={styles.analysisText}>감정·의미 분석 결과가 이 영역에 표시될 예정입니다.</Text>
      </View>
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
    gap: 12,
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
  notFoundText: {
    color: '#9C9CC0',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 100,
    marginBottom: 12,
  },
});
