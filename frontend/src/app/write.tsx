import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { goBackSafe } from '@/lib/navigation';
import { showNotice } from '@/lib/notice';
import { useDiary, type Visibility } from '@/store/diary-context';

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function todayLabel() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

// onComplete가 넘어오면 페이저 왼쪽 페이지로 임베드된 모드 — 저장/뒤로 후 라우터 back 대신
// onComplete()로 가운데(우주) 페이지로 돌려보낸다. 없으면 /write 라우트(수정 등)로 동작.
export default function WriteScreen({ onComplete }: { onComplete?: () => void } = {}) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const { addEntry, updateEntry, getEntry, groups } = useDiary();

  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // fffju 디자인엔 공개범위 3종(public/friends/private) UI가 없고 "비공개 ↔ 그룹 공유"만 있다.
  // 그래서 그룹을 하나도 안 고르면 private, 하나라도 고르면 friends(공유)로 매핑한다.
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const entry = getEntry(id);
    if (entry) {
      setText(entry.text);
      setPhotoUri(entry.photoUri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const resetForm = () => {
    setText('');
    setPhotoUri(null);
    setSelectedGroupIds([]);
  };

  const finish = () => {
    if (onComplete) {
      resetForm();
      onComplete();
    } else {
      goBackSafe();
    }
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!text.trim() || isSaving) return;

    const visibility: Visibility = selectedGroupIds.length > 0 ? 'friends' : 'private';
    setIsSaving(true);
    const result =
      isEditMode && id
        ? await updateEntry(id, text.trim(), photoUri, visibility)
        : await addEntry(text.trim(), photoUri, visibility, selectedGroupIds);
    setIsSaving(false);

    if (result.ok) {
      finish();
    } else {
      showNotice('저장 실패', result.error);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <Pressable onPress={finish}>
            <Text style={styles.backText}>{'‹  나의 우주'}</Text>
          </Pressable>

          <Text style={styles.mainTitle}>
            {isEditMode ? '오늘의 별을 고쳐볼까요?' : '오늘은 어떤 별일이 있었나요?'}
          </Text>
          <Text style={styles.dateText}>{todayLabel()}</Text>

          <View style={styles.divider} />

          <TextInput
            style={styles.textInput}
            multiline
            placeholder="글을 입력해주세요."
            placeholderTextColor="#222"
            value={text}
            onChangeText={setText}
          />

          <View style={styles.divider} />

          <View style={styles.photoHeaderRow}>
            <Text style={styles.photoSectionTitle}>오늘의 장면</Text>
            <Text style={styles.photoCountText}>사진 {photoUri ? 1 : 0} / 1</Text>
          </View>

          <View style={styles.photoBoxesRow}>
            {photoUri ? (
              <Pressable style={styles.photoIconBox} onPress={handlePickImage}>
                <Image source={{ uri: photoUri }} style={styles.photoImage} />
              </Pressable>
            ) : (
              <Pressable style={styles.photoAddBox} onPress={handlePickImage}>
                <Text style={styles.photoAddPlus}>+</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.divider} />

          {/* fffju 공유 pill: 🔒 비공개 ↔ 그룹들 (수정모드에선 공유 대상 변경 없음) */}
          {!isEditMode && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sharePillsRow}
            >
              <Pressable
                style={[styles.sharePill, selectedGroupIds.length === 0 && styles.sharePillSelected]}
                onPress={() => setSelectedGroupIds([])}
              >
                <Text style={styles.sharePillText}>🔒 비공개</Text>
              </Pressable>
              {groups.map((group) => {
                const selected = selectedGroupIds.includes(group.id);
                return (
                  <Pressable
                    key={group.id}
                    style={[styles.sharePill, selected && styles.sharePillSelected]}
                    onPress={() => setSelectedGroupIds((prev) => toggleId(prev, group.id))}
                  >
                    <Text style={styles.sharePillText}>{group.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable
            style={[styles.submitButton, (!text.trim() || isSaving) && styles.submitButtonDisabled]}
            onPress={handleSave}
            disabled={!text.trim() || isSaving}
          >
            <Text style={styles.submitButtonText}>
              {isSaving ? '저장 중...' : isEditMode ? '수정 완료' : '오늘의 별 띄우기'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

// fffju(frontend/src/app/index.jsx)의 'diary' 화면 스타일을 그대로 가져옴.
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 65,
    paddingBottom: 110,
    paddingHorizontal: 18,
  },
  card: {
    flex: 1,
    backgroundColor: '#787878',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
  },
  backText: { color: '#111', fontSize: 15, fontWeight: '600', marginBottom: 16 },
  mainTitle: { color: '#000', fontSize: 22, fontWeight: 'bold', marginBottom: 6 },
  dateText: { color: '#333', fontSize: 13, marginBottom: 14 },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 12 },
  textInput: { color: '#000', fontSize: 14, minHeight: 200, textAlignVertical: 'top' },
  photoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoSectionTitle: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  photoCountText: { color: '#222', fontSize: 12 },
  photoBoxesRow: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  photoIconBox: {
    width: 96,
    height: 96,
    backgroundColor: '#000',
    borderRadius: 14,
    borderWidth: 4,
    borderColor: '#d9d9d9',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoAddBox: {
    width: 96,
    height: 96,
    backgroundColor: '#d9d9d9',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAddPlus: { color: '#a0a0a0', fontSize: 42, fontWeight: '300', lineHeight: 46 },
  sharePillsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, marginBottom: 18 },
  sharePill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#9e9e9e',
    borderWidth: 1,
    borderColor: '#444',
  },
  sharePillSelected: { backgroundColor: '#d9d9d9', borderColor: '#d9d9d9' },
  sharePillText: { color: '#000', fontSize: 13, fontWeight: '600' },
  submitButton: {
    backgroundColor: '#bdbdbd',
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 'auto',
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
});
