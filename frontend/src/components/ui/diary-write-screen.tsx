import { Text, TextInput } from '@/components/app-text';
import { Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DiaryBackFrame,
  DiaryInputFrame,
  DiaryLockIcon,
  DiaryPhotoAddFrame,
  DiaryPhotoEmptyFrame,
  DiarySubmitFrame,
} from './diary-decoration';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { MAX_PHOTOS, type Photo } from '@/lib/journal';

type Props = {
  scale: number;
  diaryText: string;
  onChangeText: (text: string) => void;
  dateLabel: string;
  authorLabel: string;
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
};

export function DiaryWriteScreen({
  scale, diaryText, onChangeText, dateLabel, authorLabel, photoCountLabel,
  photos, photoBusy, saving, onAddPhotos, onRemovePhoto,
  groups, selectedGroupIds, onSelectPrivate, onToggleGroup, onBack, onSubmit,
  topics, selectedTopic, onToggleTopic,
}: Props) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<Photo | null>(null);
  const { contentLeft, contentWidth, headerTop, bottomSpace } = useResponsiveLayout();
  const box = (left: number, top: number, width: number, height: number) => ({
    left: left * scale, top: top * scale, width: width * scale, height: height * scale,
  });
  const type = (fontSize: number, lineHeight: number) => ({
    fontSize: fontSize * scale, lineHeight: lineHeight * scale,
  });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ marginBottom: bottomSpace }}
        contentContainerStyle={{ width: contentWidth, marginLeft: contentLeft, paddingTop: headerTop, paddingBottom: 24 * scale }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never">
        <View style={{ marginLeft: 17 * scale, width: 360 * scale, height: 40 * scale, marginBottom: 30 * scale }}>
          <DiaryBackFrame scale={scale} />
          <TouchableOpacity onPress={onBack} style={[styles.positioned, box(12, 10, 117, 28)]}>
            <Text style={[styles.text, styles.backText, { marginLeft: 24 * scale }, type(20, 26)]}>나의 우주</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.text, { marginHorizontal: 27 * scale }, type(24, 32)]}>오늘은 어떤 별일이 있었나요?</Text>
        <Text style={[styles.text, styles.dateText, { marginHorizontal: 27 * scale, marginTop: 8 * scale }, type(20, 27)]}>{dateLabel}</Text>

        <View style={{ marginHorizontal: 27 * scale, marginTop: 10 * scale, marginBottom: 6 * scale,
          flexDirection: 'row', alignItems: 'center', gap: 8 * scale }}>
          <View style={{ flex: 1, height: 1, backgroundColor: DesignPaint.ink }} />
          <Text style={[styles.text, { maxWidth: '50%' }, type(14, 20)]}>{authorLabel}</Text>
        </View>

        <View style={{ alignSelf: 'center', width: 344 * scale, height: 233 * scale }}>
          <DiaryInputFrame scale={scale} />
          <TextInput
            style={[styles.positioned, styles.text, styles.input, box(19, 32, 306, 182), type(16, 22)]}
            multiline
            placeholder="글을 입력해주세요."
            placeholderTextColor={DesignPaint.ink}
            selectionColor={DesignPaint.ink}
            cursorColor={DesignPaint.ink}
            underlineColorAndroid={DesignPaint.clear}
            value={diaryText}
            editable={!saving}
            onChangeText={onChangeText}
          />
        </View>

        {topics?.length ? (
          <>
            <Text style={[styles.text, { marginHorizontal: 27 * scale, marginTop: 16 * scale }, type(16, 22)]}>오늘의 주제</Text>
            <Text style={[styles.text, styles.photoCount, { marginHorizontal: 27 * scale }, type(12, 18)]}>선택 안 해도 돼요</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: 27 * scale, marginTop: 8 * scale, height: 30 * scale }}
              contentContainerStyle={{ alignItems: 'center', gap: 6 * scale }}>
              {topics.map((t) => {
                const selected = selectedTopic === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onToggleTopic?.(t.id)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[styles.pill, { height: 28 * scale, borderRadius: 14 * scale, borderWidth: (selected ? 1.5 : 1) * scale, paddingHorizontal: 12 * scale, opacity: selected ? 1 : 0.75 }]}>
                    <Text style={[styles.text, type(13, 18)]}>{selected ? '✓ ' : ''}{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <View style={{ marginHorizontal: 27 * scale, marginTop: 26 * scale, marginBottom: 12 * scale,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.text, type(20, 27)]}>오늘의 장면</Text>
          <Text style={[styles.text, styles.photoCount, type(16, 24)]}>{photoCountLabel}</Text>
        </View>

        <View style={{ marginHorizontal: 29 * scale, flexDirection: 'row', gap: 12 * scale }}>
          <TouchableOpacity accessibilityLabel="일기 사진 추가" onPress={onAddPhotos}
            disabled={photoBusy || saving || photos.length >= MAX_PHOTOS}
            style={{ width: 128 * scale, height: 129 * scale, opacity: photoBusy || photos.length >= MAX_PHOTOS ? 0.5 : 1 }}>
            <DiaryPhotoAddFrame scale={scale} />
            <Text style={[styles.positioned, styles.text, styles.photoCaption, box(0, 87, 128, 25), type(16, 24)]}>{photoBusy ? '불러오는 중' : '사진 추가'}</Text>
          </TouchableOpacity>
          {photos.length === 0 ? (
            <View style={{ width: 131 * scale, height: 129 * scale }}><DiaryPhotoEmptyFrame scale={scale} /></View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, height: 129 * scale }}
              contentContainerStyle={{ gap: 8 * scale }}>
              {photos.map((photo, index) => (
                <View key={photo.id} style={{ width: 131 * scale, height: 129 * scale }}>
                  <TouchableOpacity accessibilityLabel={`첨부 사진 ${index + 1} 확대`} onPress={() => setPreview(photo)}>
                    <Image source={{ uri: photo.uri }} style={{ width: 131 * scale, height: 129 * scale, borderRadius: 12 * scale }} />
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityLabel={`첨부 사진 ${index + 1} 삭제`} disabled={saving} onPress={() => onRemovePhoto(photo.id)}
                    style={{ position: 'absolute', right: 2 * scale, top: 2 * scale, width: 32 * scale, height: 32 * scale, borderRadius: 16 * scale, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[styles.text, type(20, 26)]}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View accessibilityLabel="일기 공유 범위" style={{ marginTop: 16 * scale, marginLeft: 27 * scale, marginRight: 25 * scale,
          flexDirection: 'row', flexWrap: 'wrap', gap: 8 * scale, zIndex: 1 }}>
          <Pressable
            accessibilityRole="button" accessibilityLabel="비공개, 나의 우주에만 별 띄우기"
            onPress={() => { Keyboard.dismiss(); onSelectPrivate(); }}
            disabled={saving}
            accessibilityState={{ selected: selectedGroupIds.length === 0 }}
            style={[styles.pill, { minWidth: 114 * scale, minHeight: Math.max(44, 44 * scale), borderRadius: 22 * scale,
              borderWidth: (selectedGroupIds.length === 0 ? 2 : 1) * scale, opacity: selectedGroupIds.length === 0 ? 1 : 0.65, gap: 6 * scale }]}>
            <DiaryLockIcon scale={scale} />
            <Text style={[styles.text, type(14, 20)]}>비공개</Text>
          </Pressable>
          {groups.map((group) => (
            <Pressable
              key={group.id}
              accessibilityRole="button" accessibilityLabel={`${group.name}에 일기 공유`}
              onPress={() => { Keyboard.dismiss(); onToggleGroup(group.id); }} disabled={saving}
              accessibilityState={{ selected: selectedGroupIds.includes(group.id) }}
              style={[styles.pill, { minWidth: 105 * scale, maxWidth: '100%', minHeight: Math.max(44, 44 * scale),
                borderRadius: 22 * scale, borderWidth: (selectedGroupIds.includes(group.id) ? 2 : 1) * scale,
                backgroundColor: selectedGroupIds.includes(group.id) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 18 * scale, paddingVertical: 10 * scale }]}>
              <Text style={[styles.text, { flexShrink: 1 }, type(14, 20)]}>{selectedGroupIds.includes(group.id) ? '✓ ' : ''}{group.name}</Text>
            </Pressable>
          ))}
        </View>

        <TouchableOpacity onPress={onSubmit} disabled={saving || photoBusy} accessibilityLabel="오늘의 별 띄우기"
          style={{ width: 344 * scale, height: 58 * scale, marginTop: 23 * scale, marginBottom: 21 * scale, alignSelf: 'center' }}>
          <DiarySubmitFrame scale={scale} />
          <Text style={[styles.positioned, styles.text, styles.submitText, box(0, 19, 344, 24), type(14, 22)]}>{saving ? '저장 중…' : '오늘의 별 띄우기'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: '#000e', paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <TouchableOpacity accessibilityLabel="사진 미리보기 닫기" onPress={() => setPreview(null)} style={{ padding: 20, alignSelf: 'flex-end' }}>
            <Text style={[styles.text, { fontSize: 24 }]}>×</Text>
          </TouchableOpacity>
          {preview && <Image source={{ uri: preview.uri }} resizeMode="contain" style={{ flex: 1 }} />}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DesignPaint.background },
  positioned: { position: 'absolute' },
  text: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  backText: { textDecorationLine: 'underline' },
  dateText: { fontFamily: DesignFonts.bold, fontWeight: '700' },
  input: { padding: 0, textAlignVertical: 'top' },
  photoCount: { textAlign: 'right' },
  photoCaption: { textAlign: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: DesignPaint.diaryPill, borderColor: DesignPaint.ink },
  submitText: { textAlign: 'center' },
});
