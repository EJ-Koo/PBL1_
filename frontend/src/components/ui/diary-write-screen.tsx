import { useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ScrollView } from '@/components/app-scroll-view';
import { Text, TextInput } from '@/components/app-text';
import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { MAX_PHOTOS, type Photo } from '@/lib/journal';
import { DiaryBackFrame, DiaryInputFrame, DiaryLockIcon, DiaryPhotoAddFrame, DiaryPhotoEmptyFrame, DiarySubmitFrame } from './diary-decoration';
import { PhotoScrollStrip } from './photo-scroll-strip';

type Props = {
  diaryText: string;
  onChangeText: (text: string) => void;
  dateLabel: string;
  photoCountLabel: string;
  photos: Photo[];
  photoBusy: boolean;
  saving: boolean;
  onAddPhotos: () => void;
  onRemovePhoto: (id: string) => void;
  groups: { id: string; name: string }[];
  selectedGroupIds: string[];
  onSelectPrivate: () => void;
  onToggleGroup: (id: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  topics?: { id: string; label: string }[];
  selectedTopic?: string | null;
  onToggleTopic?: (id: string) => void;
  hasBottomNav: boolean;
  rememberSelections?: boolean;
  onToggleRemember?: () => void;
};

export function DiaryWriteScreen({
  diaryText, onChangeText, dateLabel, photoCountLabel, photos, photoBusy, saving,
  onAddPhotos, onRemovePhoto, groups, selectedGroupIds, onSelectPrivate, onToggleGroup,
  onBack, onSubmit, topics, selectedTopic, onToggleTopic, hasBottomNav, rememberSelections, onToggleRemember,
}: Props) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<Photo | null>(null);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const { wide, compact, navLeft, navWidth, navHeight, navBottom, scale: phoneScale } = useResponsiveLayout();
  const pageWidth = Math.min(navWidth, 1800);
  const scale = wide ? Math.max(0.8, pageWidth / 1440) : phoneScale;
  const bodyWidth = pageWidth * (wide ? 1248 / 1440 : 344 / 393);
  const columnGap = wide ? bodyWidth * 0.045 : 0;
  const sideWidth = wide ? Math.max(210, bodyWidth * 0.298) : bodyWidth;
  const photoGap = (wide ? 24 : 12) * scale;
  const photoSize = wide ? (sideWidth - photoGap) / 2 : Math.min(128 * scale, (sideWidth - photoGap) / 2);
  const tile = { width: photoSize, height: photoSize, flexShrink: 0 };
  const addDisabled = photoBusy || saving || photos.length >= MAX_PHOTOS;
  const type = (size: number, line: number) => ({ fontSize: size * scale, lineHeight: line * scale });
  const selectedTopicLabel = topics?.find(topic => topic.id === selectedTopic)?.label;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ marginLeft: navLeft, width: navWidth, marginBottom: navBottom + (hasBottomNav ? navHeight : 0) }}
        contentContainerStyle={{ alignItems: 'center', paddingTop: Math.max(insets.top + 8, (compact ? 12 : 32) * scale), paddingBottom: 16 * scale }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never">
        <View style={[styles.header, { width: pageWidth * 0.912, minHeight: Math.max(44, (wide ? 48 : 40) * scale), paddingHorizontal: (wide ? 22 : 16) * scale }]}>
          <DiaryBackFrame scale={scale} wide={wide} />
          <Pressable accessibilityRole="button" accessibilityLabel="지난 기록 열기"
            onPress={() => { Keyboard.dismiss(); router.push('/archive'); }} style={styles.headerAction}>
            <Text style={[styles.muted, type(wide ? 17 : 14, 22)]}>‹  지난 기록</Text>
          </Pressable>
          {wide && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={[styles.text, type(21, 30)]}>STAR2DAY</Text>
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel="나의 우주로 이동" onPress={onBack} style={styles.headerAction}>
            <Text style={[styles.text, type(wide ? 17 : 14, 22)]}>나의 우주  ›</Text>
          </Pressable>
        </View>

        <View style={{ width: bodyWidth, marginTop: (wide ? 46 : 32) * scale }}>
          <Text accessibilityRole="header" style={[styles.text, type(wide ? 36 : 24, wide ? 50 : 32)]}>오늘은 어떤 별일이 있었나요?</Text>
          <View style={[styles.rowBetween, { marginTop: (wide ? 14 : 7) * scale, minHeight: 30 * scale }]}>
            <Text style={[styles.muted, { flexShrink: 1 }, type(wide ? 22 : 18, wide ? 31 : 26)]}>{dateLabel}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 12 * scale, flexShrink: 1 }}>
            {!!topics?.length && <Pressable accessibilityRole="button" accessibilityLabel="오늘의 주제 선택"
              accessibilityState={{ expanded: topicsOpen }} aria-expanded={topicsOpen} hitSlop={6}
              onPress={() => setTopicsOpen(open => !open)} style={styles.topicToggle}>
              <Text style={[styles.muted, type(12, 17)]}>{selectedTopicLabel ?? '주제 선택'} {topicsOpen ? '⌄' : '›'}</Text>
            </Pressable>}
              {rememberSelections !== undefined && <Pressable accessibilityRole="checkbox" accessibilityLabel="이전 주제와 공유 그룹 선택 기억하기"
                accessibilityState={{ checked: rememberSelections, disabled: saving }} disabled={saving} onPress={onToggleRemember}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, flexShrink: 1, paddingVertical: 4 }}>
                <View style={{ width: 20, height: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[styles.text, { fontSize: 14, lineHeight: 18 }]}>{rememberSelections ? '✓' : ''}</Text>
                </View>
                <Text style={[styles.muted, { fontSize: Math.max(13, 13 * scale), lineHeight: Math.max(20, 20 * scale), flexShrink: 1 }]}>이전 선택 기억하기</Text>
              </Pressable>}
            </View>
          </View>
          {topicsOpen && topics && <View style={[styles.chips, { marginVertical: 8 * scale }]}>
            {topics.map(topic => {
              const selected = selectedTopic === topic.id;
              return <Pressable key={topic.id} accessibilityRole="button" accessibilityLabel={topic.label}
                accessibilityState={{ selected }} disabled={saving} onPress={() => onToggleTopic?.(topic.id)}
                style={[styles.pill, { minHeight: 40 }, selected && styles.selected]}>
                <Text style={[styles.text, type(13, 19)]}>{selected ? '✓ ' : ''}{topic.label}</Text>
              </Pressable>;
            })}
          </View>}
          <View style={[styles.dividerRow, { marginTop: 4 * scale }]}>
            <View style={[styles.rule, !wide && styles.mobileRule]} />
            {!wide && <Text style={[styles.text, type(12, 18)]}>STAR2DAY</Text>}
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? columnGap : 27 * scale, marginTop: (wide ? 36 : 5) * scale }}>
            <View style={wide ? { flex: 1, minWidth: 0, minHeight: 285 * scale } : { height: Math.min(bodyWidth * 233 / 344, 340 * scale) }}>
              <DiaryInputFrame scale={scale} wide={wide} />
              <TextInput accessibilityLabel="일기 내용" multiline
                style={[StyleSheet.absoluteFill, styles.text, styles.input, type(wide ? 17 : 16, 24),
                  { paddingHorizontal: (wide ? 28 : 18) * scale, paddingVertical: (wide ? 26 : 32) * scale }]}
                placeholder="글을 입력해주세요." placeholderTextColor={wide ? '#bbb' : DesignPaint.ink}
                selectionColor={DesignPaint.ink} cursorColor={DesignPaint.ink} underlineColorAndroid={DesignPaint.clear}
                value={diaryText} editable={!saving} onChangeText={onChangeText} />
            </View>

            <View style={{ width: sideWidth }}>
              <View style={[styles.rowBetween, { minHeight: 29 * scale, marginBottom: (wide ? 26 : 8) * scale }]}>
                <Text style={[styles.text, type(wide ? 20 : 18, 26)]}>오늘의 장면</Text>
                <Text style={[styles.muted, type(16, 24)]}>{photoCountLabel}</Text>
              </View>
              <PhotoScrollStrip height={photoSize} gap={photoGap} scale={scale}>
                <Pressable accessibilityRole="button" accessibilityLabel="일기 사진 추가" onPress={onAddPhotos}
                  disabled={addDisabled} style={[tile, addDisabled && styles.dimmed]}>
                  <DiaryPhotoAddFrame wide={wide} />
                  <Text numberOfLines={1} style={[styles.photoCaption, styles.text, type(16, 22)]}>{photoBusy ? '불러오는 중' : '사진 추가'}</Text>
                </Pressable>
                {photos.length === 0 ? <View style={tile}><DiaryPhotoEmptyFrame /></View> : photos.map((photo, index) => (
                  <View key={photo.id} style={tile}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`첨부 사진 ${index + 1} 확대`} onPress={() => setPreview(photo)} style={styles.photo}>
                      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`첨부 사진 ${index + 1} 삭제`} disabled={saving}
                      onPress={() => onRemovePhoto(photo.id)} style={styles.removePhoto}>
                      <Text style={[styles.text, type(19, 25)]}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </PhotoScrollStrip>

              <View accessibilityLabel="일기 공유 범위" style={[styles.chips, { marginTop: (wide ? 40 : 16) * scale }]}>
                <Pressable accessibilityRole="button" accessibilityLabel="비공개, 나의 우주에만 별 띄우기"
                  onPress={() => { Keyboard.dismiss(); onSelectPrivate(); }} disabled={saving}
                  accessibilityState={{ selected: selectedGroupIds.length === 0 }}
                  style={[styles.pill, { minWidth: 114 * scale }, !selectedGroupIds.length && styles.selected]}>
                  <DiaryLockIcon scale={scale} /><Text style={[styles.text, type(14, 20)]}>비공개</Text>
                </Pressable>
                {groups.map(group => {
                  const selected = selectedGroupIds.includes(group.id);
                  return <Pressable key={group.id} accessibilityRole="button" accessibilityLabel={`${group.name}에 일기 공유`}
                    onPress={() => { Keyboard.dismiss(); onToggleGroup(group.id); }} disabled={saving}
                    accessibilityState={{ selected }} style={[styles.pill, { minWidth: 98 * scale }, selected && styles.selected]}>
                    <Text style={[styles.text, { flexShrink: 1 }, type(14, 20)]}>{selected ? '✓ ' : ''}{group.name}</Text>
                  </Pressable>;
                })}
              </View>

              <Pressable accessibilityRole="button" onPress={onSubmit} disabled={saving || photoBusy} accessibilityLabel="오늘의 별 띄우기"
                style={{ height: Math.max(44, (wide ? 56 : 58) * scale), marginTop: (wide ? 16 : 22) * scale }}>
                <DiarySubmitFrame wide={wide} />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
                  <Text style={[styles.text, type(wide ? 16 : 14, 22)]}>{saving ? '저장 중…' : '오늘의 별 띄우기'}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
      <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: '#000e', paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <Pressable accessibilityRole="button" accessibilityLabel="사진 미리보기 닫기" onPress={() => setPreview(null)} style={{ padding: 20, alignSelf: 'flex-end' }}>
            <Text style={[styles.text, { fontSize: 24 }]}>×</Text>
          </Pressable>
          {preview && <Image source={{ uri: preview.uri }} resizeMode="contain" style={{ flex: 1 }} />}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DesignPaint.background },
  text: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  muted: { color: '#bdbdbd', includeFontPadding: false },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { minHeight: 44, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topicToggle: { paddingVertical: 6, alignItems: 'flex-end' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rule: { flex: 1, height: 1, backgroundColor: '#666' },
  mobileRule: { backgroundColor: '#ccc' },
  input: { padding: 0, textAlignVertical: 'top' },
  photoCaption: { position: 'absolute', bottom: '15%', width: '100%', textAlign: 'center' },
  photo: { flex: 1, borderWidth: 1, borderColor: '#bbb' },
  removePhoto: { position: 'absolute', right: 2, top: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: '#000b', alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  pill: { minHeight: 44, maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 28, flexDirection: 'row', gap: 7,
    alignItems: 'center', justifyContent: 'center', backgroundColor: DesignPaint.diaryPill, borderColor: '#c4c4c4', borderWidth: 1 },
  selected: { borderColor: '#fff', borderWidth: 2 },
});
