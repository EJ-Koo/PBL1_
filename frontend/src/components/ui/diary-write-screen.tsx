import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  DiaryBackFrame,
  DiaryInputFrame,
  DiaryLockIcon,
  DiaryPhotoAddFrame,
  DiaryPhotoEmptyFrame,
  DiarySubmitFrame,
} from './diary-decoration';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
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
};

export function DiaryWriteScreen({
  scale, diaryText, onChangeText, dateLabel, authorLabel, photoCountLabel,
  photos, photoBusy, saving, onAddPhotos, onRemovePhoto,
  groups, selectedGroupIds, onSelectPrivate, onToggleGroup, onBack, onSubmit,
}: Props) {
  const [preview, setPreview] = useState<Photo | null>(null);
  const insets = useSafeAreaInsets();
  // The shared navigation occupies y=788…818 in the 393×852 reference.
  const bottomSpace = Math.max(34 * scale, insets.bottom) + 30 * scale;
  // Only the header needs an inset adjustment; all other content starts below
  // the safe area. Its decorative brackets can extend above the text.
  const headerTop = Math.max(35 * scale, insets.top - 10 * scale);
  const box = (left: number, top: number, width: number, height: number) => ({
    left: left * scale, top: top * scale, width: width * scale, height: height * scale,
  });
  const type = (fontSize: number, lineHeight: number) => ({
    fontSize: fontSize * scale, lineHeight: lineHeight * scale,
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ marginBottom: bottomSpace }}
        contentContainerStyle={{ width: 393 * scale, height: 788 * scale, marginLeft: insets.left }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never">
        <View style={[styles.positioned, { left: 17 * scale, top: headerTop, width: 360 * scale, height: 40 * scale }]}>
          <DiaryBackFrame scale={scale} />
          <TouchableOpacity onPress={onBack} style={[styles.positioned, box(12, 10, 117, 28)]}>
            <Text style={[styles.text, styles.backText, { marginLeft: 24 * scale }, type(20, 26)]}>나의 우주</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.positioned, styles.text, box(28, 105, 340, 34), type(24, 32)]}>오늘은 어떤 별일이 있었나요?</Text>
        <Text style={[styles.positioned, styles.text, styles.dateText, box(27, 146, 341, 28), type(20, 27)]}>{dateLabel}</Text>

        <View style={[styles.positioned, box(27, 179, 341, 22)]}>
          <Svg width={341 * scale} height={22 * scale} viewBox="0 0 341 22" pointerEvents="none">
            <Path d="M0 10.5H266" stroke={DesignPaint.ink} strokeWidth={1} />
          </Svg>
          <Text style={[styles.positioned, styles.text, box(273, 0, 68, 21), type(14, 20)]}>{authorLabel}</Text>
        </View>

        <View style={[styles.positioned, box(25, 201, 344, 233)]}>
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

        <Text style={[styles.positioned, styles.text, box(27, 460, 200, 28), type(20, 27)]}>오늘의 장면</Text>
        <Text style={[styles.positioned, styles.text, styles.photoCount, box(334, 460, 33, 25), type(16, 24)]}>{photoCountLabel}</Text>

        <TouchableOpacity accessibilityLabel="일기 사진 추가" onPress={onAddPhotos}
          disabled={photoBusy || saving || photos.length >= MAX_PHOTOS}
          style={[styles.positioned, box(29, 500, 128, 129), { opacity: photoBusy || photos.length >= MAX_PHOTOS ? 0.5 : 1 }]}>
          <DiaryPhotoAddFrame scale={scale} />
          <Text style={[styles.positioned, styles.text, styles.photoCaption, box(0, 87, 128, 25), type(16, 24)]}>{photoBusy ? '불러오는 중' : '사진 추가'}</Text>
        </TouchableOpacity>
        {photos.length === 0 ? (
          <View style={[styles.positioned, box(169, 500, 131, 129)]}><DiaryPhotoEmptyFrame scale={scale} /></View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.positioned, box(169, 500, 199, 129)]}
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.positioned, box(27, 643, 341, 43)]}
          contentContainerStyle={{ alignItems: 'center', gap: 8 * scale }}>
          <TouchableOpacity
            onPress={onSelectPrivate}
            disabled={saving}
            accessibilityState={{ selected: selectedGroupIds.length === 0 }}
            style={[styles.pill, { width: 114 * scale, height: 43 * scale, borderRadius: 22 * scale, borderWidth: 1.5 * scale, gap: 6 * scale }]}>
            <DiaryLockIcon scale={scale} />
            <Text style={[styles.text, type(14, 20)]}>비공개</Text>
          </TouchableOpacity>
          {groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              onPress={() => onToggleGroup(group.id)} disabled={saving}
              accessibilityState={{ selected: selectedGroupIds.includes(group.id) }}
              style={[styles.pill, { minWidth: 105 * scale, height: 43 * scale, borderRadius: 22 * scale, borderWidth: 1.5 * scale, paddingHorizontal: 18 * scale }]}>
              <Text style={[styles.text, type(14, 20)]}>{selectedGroupIds.includes(group.id) ? '✓ ' : ''}{group.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity onPress={onSubmit} disabled={saving || photoBusy} accessibilityLabel="오늘의 별 띄우기"
          style={[styles.positioned, box(25, 709, 344, 58)]}>
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
    </View>
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
