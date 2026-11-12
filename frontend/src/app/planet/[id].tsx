// [MODIFIED 2026-11-05] 사진 여러 장(최대 5장)을 가로로 넘겨 보기, 넓은 화면에서는 폭 최대 520px 가운데 정렬.
// [MODIFIED 2026-11-12] '행성 꾸미기' 버튼: 산 특수 효과를 이 행성에 적용·변경·해제 (components/planet-decorator.tsx)
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlanetDecorator } from '@/components/planet-decorator';
import { goBackSafe } from '@/lib/navigation';
import { EFFECT_LABELS, SPECIAL_NAMES, effectToDraw } from '@/lib/special-planet';
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
  const [decorating, setDecorating] = useState(false);

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
  const effect = effectToDraw(entry.effect);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.outer}>
      <View style={styles.content}>
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

      {entry.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.photoRow}>
          {entry.photos.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.uri }}
              style={[styles.photo, entry.photos.length === 1 && styles.photoSingle]}
            />
          ))}
        </ScrollView>
      )}

      <Text style={styles.text}>{entry.text}</Text>

      {/* [MODIFIED 2026-11-12] 행성 색·무늬는 AI 감정 분석, 특수 효과는 사용자가 직접 적용한 것 */}
      <View style={styles.analysisBox} testID="planet-analysis">
        <Text style={styles.analysisTitle}>{effect ? `✦ ${SPECIAL_NAMES[effect]}` : '일반 행성'}</Text>
        <Text style={styles.analysisText}>
          {entry.planet.version === 'fallback'
            ? '아직 감정 분석 결과가 없어 기본색으로 표현했어요.'
            : entry.planet.state === 'none'
              ? '뚜렷한 감정이 없어 차분한 기본색으로 표현했어요.'
              : `행성 색과 무늬: '${entry.planet.primary.name}' 감정`}
        </Text>
        <Text style={styles.analysisText}>
          {effect
            ? `${EFFECT_LABELS[effect].icon} ${EFFECT_LABELS[effect].name}를 적용한 행성이에요.`
            : '상점에서 산 특수 효과로 이 행성을 꾸밀 수 있어요.'}
        </Text>
      </View>

      <Pressable
        style={styles.decorateButton}
        onPress={() => setDecorating(true)}
        testID="planet-decorate"
        accessibilityLabel="행성 꾸미기">
        <Text style={styles.decorateButtonText}>🪐 행성 꾸미기</Text>
      </Pressable>
      <PlanetDecorator visible={decorating} diaryId={entry.id} onClose={() => setDecorating(false)} />

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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
  },
  outer: {
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 520,
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
  photoRow: {
    gap: 10,
  },
  photo: {
    width: 220,
    height: 200,
    borderRadius: 12,
  },
  photoSingle: {
    width: 472,
    maxWidth: '100%',
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
  decorateButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7C6CF6',
    backgroundColor: '#14142A',
  },
  decorateButtonText: {
    color: '#C9C2FF',
    fontSize: 15,
    fontWeight: '600',
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
