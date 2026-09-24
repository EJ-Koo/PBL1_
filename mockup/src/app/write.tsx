import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { goBackSafe } from '@/lib/navigation';
import { useDiary, type Visibility } from '@/store/diary-context';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'public', label: '전체공개' },
  { value: 'friends', label: '친구에게만 공개' },
  { value: 'private', label: '공개안함' },
];

export default function WriteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const { addEntry, updateEntry, getEntry } = useDiary();

  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');

  useEffect(() => {
    if (!id) return;
    const entry = getEntry(id);
    if (entry) {
      setText(entry.text);
      setPhotoUri(entry.photoUri);
      setVisibility(entry.visibility);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const handleSave = () => {
    if (!text.trim()) return;
    if (isEditMode && id) {
      updateEntry(id, text.trim(), photoUri, visibility);
    } else {
      addEntry(text.trim(), photoUri, visibility);
    }
    goBackSafe();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{isEditMode ? '기록 수정' : '별 생성'}</Text>

      <View style={styles.visibilitySection}>
        <Text style={styles.visibilityLabel}>공개 범위</Text>
        <View style={styles.visibilityRow}>
          {VISIBILITY_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.visibilityChip,
                visibility === option.value && styles.visibilityChipActive,
              ]}
              onPress={() => setVisibility(option.value)}
            >
              <Text
                style={[
                  styles.visibilityChipText,
                  visibility === option.value && styles.visibilityChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={styles.photoBox} onPress={handlePickImage}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <Text style={styles.photoPlaceholder}>+ 사진 추가</Text>
        )}
      </Pressable>

      <TextInput
        style={styles.textInput}
        placeholder="오늘 하루는 어땠나요?"
        placeholderTextColor="#5F5F80"
        multiline
        value={text}
        onChangeText={setText}
      />

      <View style={styles.buttonRow}>
        <Pressable style={styles.cancelButton} onPress={goBackSafe}>
          <Text style={styles.cancelButtonText}>취소</Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, !text.trim() && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!text.trim()}
        >
          <Text style={styles.saveButtonText}>저장</Text>
        </Pressable>
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
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  photoBox: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A45',
    borderStyle: 'dashed',
    backgroundColor: '#14142A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    color: '#5F5F80',
    fontSize: 14,
  },
  textInput: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#2A2A45',
    borderRadius: 12,
    backgroundColor: '#14142A',
    color: '#FFFFFF',
    fontSize: 15,
    padding: 16,
    textAlignVertical: 'top',
  },
  visibilitySection: {
    gap: 10,
    alignItems: 'center',
  },
  visibilityLabel: {
    color: '#9C9CC0',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  visibilityChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A45',
    backgroundColor: '#14142A',
  },
  visibilityChipActive: {
    backgroundColor: '#7C6CF6',
    borderColor: '#7C6CF6',
  },
  visibilityChipText: {
    color: '#9C9CC0',
    fontSize: 13,
  },
  visibilityChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A45',
  },
  cancelButtonText: {
    color: '#9C9CC0',
    fontSize: 15,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#7C6CF6',
  },
  saveButtonDisabled: {
    backgroundColor: '#3A3A5A',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
