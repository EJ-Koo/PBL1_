import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
import { PlanetDecorator } from '@/components/planet-decorator';
import { PlanetDetailBackground, PlanetDetailFrame } from '@/components/ui/planet-detail-decoration';
import { PlanetPreview } from '@/components/universe-scene';
import { KoreanFonts } from '@/constants/ui-design';
import { useLanguage } from '@/lib/language';
import { PLANET_BASE_RADIUS, planetScaleForText } from '@/lib/planet-visual';
import { EFFECT_LABELS, SPECIAL_NAMES, effectToDraw } from '@/lib/special-planet';
import type { DiaryEntry, Visibility } from '@/store/diary-context';

const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: '전체공개', friends: '친구에게만 공개', private: '비공개',
};

type Props = {
  entry: DiaryEntry;
  owned: boolean;
  editable: boolean;
  previewVisible: boolean;
  group?: boolean;
  onBack: () => void;
  onEdit: () => void;
};

export function PlanetDetailView({ entry, owned, editable, previewVisible, group = false, onBack, onEdit }: Props) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = Math.min(520, Math.max(0, width - insets.left - insets.right));
  const scale = pageWidth / 393;
  const styles = useMemo(() => makeStyles(scale), [scale]);
  const [decorating, setDecorating] = useState(false);
  const date = new Date(entry.createdAt);
  const dateLabel = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const effect = effectToDraw(entry.effect);

  return <View style={styles.screen} testID="planet-detail">
    <PlanetDetailBackground />
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.outer, {
        paddingLeft: insets.left, paddingRight: insets.right,
        paddingTop: Math.max(18 * scale, insets.top + 12),
        paddingBottom: Math.max(32 * scale, insets.bottom + 20),
      }]}>
      <View style={[styles.content, { width: pageWidth }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t(group ? '그룹 우주로' : '우주로')}
          onPress={onBack} hitSlop={10} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>{group ? `← ${t('그룹 우주로')}` : `← ${t('우주로')}`}</Text>
        </Pressable>

        <View style={styles.planetHeader}>
          <View style={styles.planet} pointerEvents="none" testID="planet-detail-preview">
            <View style={styles.planetCanvas}>
              {previewVisible && !decorating && <PlanetPreview id={entry.id} visual={entry.planet} effect={entry.effect} surface={entry.surface}
                radius={PLANET_BASE_RADIUS * planetScaleForText(entry.text)} quality="high" zoom={effect ? 1 : 1.4} />}
            </View>
            <View style={StyleSheet.absoluteFill}><PlanetDetailFrame kind="planet" /></View>
          </View>
          <Text style={styles.date}>{dateLabel}</Text>
          <View style={styles.visibilityBadge}>
            <Text style={styles.visibilityText}>{t(VISIBILITY_LABELS[entry.visibility])}</Text>
          </View>
        </View>

        {entry.photos.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.photos} contentContainerStyle={styles.photoRow}>
          {entry.photos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.uri }}
            accessibilityLabel={t('일기 사진 {number}', { number: index + 1 })}
            style={[styles.photo, entry.photos.length === 1 && { width: pageWidth - 40 * scale }]} />)}
        </ScrollView>}

        <Text selectable style={styles.diary}>{entry.text}</Text>

        <View style={styles.analysis} testID="planet-analysis">
          <View style={StyleSheet.absoluteFill}><PlanetDetailFrame kind="panel" /></View>
          <Text accessibilityRole="header" style={styles.analysisTitle}>{effect ? t(SPECIAL_NAMES[effect]) : t('일반 행성')}</Text>
          <Text style={styles.analysisText}>
            {entry.planet.version === 'fallback'
              ? t('아직 감정 분석 결과가 없어 기본색으로 표현했어요.')
              : entry.planet.state === 'none'
                ? t('뚜렷한 감정이 없어 차분한 기본색으로 표현했어요.')
                : t('행성 색과 무늬: {emotion} 감정', { emotion: entry.planet.primary.name })}
          </Text>
          <Text style={styles.analysisText}>{effect
            ? t('{effect}를 적용한 행성이에요.', { effect: t(EFFECT_LABELS[effect].name) })
            : t('상점에서 산 특수 효과로 이 행성을 꾸밀 수 있어요.')}</Text>
        </View>

        {owned && <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('행성 꾸미기')} onPress={() => setDecorating(true)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]} testID="planet-decorate">
            <View pointerEvents="none" style={StyleSheet.absoluteFill}><PlanetDetailFrame kind="button" /></View>
            <Text style={styles.buttonText}>{t('행성 꾸미기')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('수정')} accessibilityState={{ disabled: !editable }}
            disabled={!editable} onPress={() => { if (editable) onEdit(); }} testID="planet-edit"
            style={({ pressed }) => [styles.button, styles.editButton, pressed && styles.pressed]}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}><PlanetDetailFrame kind="button" disabled={!editable} /></View>
            <Text style={[styles.buttonText, !editable && styles.disabledText]}>{t('수정')}</Text>
          </Pressable>
          {!editable && <Text style={styles.editHint}>{t('작성한 날에만 수정할 수 있어요.')}</Text>}
          <PlanetDecorator visible={decorating} diaryId={entry.id} onClose={() => setDecorating(false)} />
        </View>}
      </View>
    </ScrollView>
  </View>;
}

function makeStyles(scale: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#080a16' },
    scroll: { flex: 1 },
    outer: { alignItems: 'center', flexGrow: 1 },
    content: { paddingHorizontal: 20 * scale },
    back: { alignSelf: 'flex-start', minHeight: 24 * scale, justifyContent: 'center', marginBottom: 18 * scale },
    backText: { color: '#999ba9', fontFamily: KoreanFonts.regular, fontSize: Math.max(14, 15 * scale), lineHeight: 22 * scale },
    pressed: { opacity: 0.7 },
    planetHeader: { alignItems: 'center' },
    planet: { width: '100%', height: 200 * scale },
    planetCanvas: { flex: 1, margin: 6 * scale },
    date: { color: '#a09bc3', fontFamily: KoreanFonts.regular, fontSize: Math.max(11, 12 * scale), lineHeight: 20 * scale, marginTop: 12 * scale },
    visibilityBadge: { marginTop: 6 * scale, minHeight: 22 * scale, paddingHorizontal: 17 * scale, paddingVertical: 2 * scale,
      borderRadius: 14 * scale, borderWidth: 1, borderColor: '#494853', backgroundColor: '#202036', alignItems: 'center', justifyContent: 'center' },
    visibilityText: { color: '#aaa5cf', fontFamily: KoreanFonts.regular, fontSize: Math.max(10, 11 * scale), lineHeight: 16 * scale },
    photos: { marginTop: 22 * scale },
    photoRow: { gap: 10 * scale },
    photo: { width: 220 * scale, height: 160 * scale, borderRadius: 8 * scale, resizeMode: 'cover' },
    diary: { color: '#f1f0f5', fontFamily: KoreanFonts.regular, fontSize: Math.max(16, 18 * scale), lineHeight: Math.max(24, 25 * scale), marginTop: 22 * scale },
    analysis: { minHeight: 94 * scale, marginTop: 22 * scale, paddingHorizontal: 19 * scale, paddingVertical: 14 * scale, gap: 4 * scale },
    analysisTitle: { color: '#b7caf1', fontFamily: KoreanFonts.bold, fontSize: Math.max(14, 15 * scale), lineHeight: 21 * scale, marginBottom: 2 * scale },
    analysisText: { color: '#9693aa', fontFamily: KoreanFonts.regular, fontSize: Math.max(11, 12 * scale), lineHeight: Math.max(17, 17 * scale) },
    actions: { marginTop: 22 * scale },
    button: { minHeight: Math.max(44, 44 * scale), paddingHorizontal: 16 * scale, paddingVertical: 10 * scale, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: '#f2f1f7', fontFamily: KoreanFonts.bold, fontSize: Math.max(15, 16 * scale), lineHeight: 23 * scale },
    editButton: { marginTop: 18 * scale },
    disabledText: { color: '#777585' },
    editHint: { marginTop: 10 * scale, color: '#9691aa', fontFamily: KoreanFonts.regular,
      fontSize: Math.max(10, 10 * scale), lineHeight: 18 * scale, textAlign: 'center' },
  });
}
