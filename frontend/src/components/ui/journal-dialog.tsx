import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { searchDiaries, type Diary } from '@/lib/journal';

export type JournalDialogMode = 'search' | 'calendar';
type Props = {
  mode: JournalDialogMode | null; diaries: Diary[];
  onClose: () => void;
};
const titles = { search: '일기 내용 검색', calendar: '날짜로 일기 찾기' };

export function JournalDialog({ mode, diaries, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [selected, setSelected] = useState<Diary | null>(null);
  const results = searchDiaries(diaries, query, mode === 'calendar' ? date : '');
  const close = () => { setSelected(null); onClose(); };
  const validDate = !date || /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <Modal visible={mode !== null} transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{selected ? '나의 일기' : mode ? titles[mode] : ''}</Text>
            <Pressable accessibilityLabel="창 닫기" onPress={close} style={styles.close}><Text style={styles.text}>닫기 ×</Text></Pressable>
          </View>
          {selected ? (
            <ScrollView contentContainerStyle={{ gap: 18 }}>
              <Pressable onPress={() => setSelected(null)} style={styles.row}><Text style={styles.text}>‹ 검색 결과로</Text></Pressable>
              <Text style={styles.muted}>{new Date(selected.createdAt).toLocaleString('ko-KR')}</Text>
              <Text style={[styles.text, { lineHeight: 25 }]} selectable>{selected.content}</Text>
              <Text style={styles.muted}>{selected.groupIds.length ? '공유한 그룹에서 함께 볼 수 있는 별' : '비공개 일기'}</Text>
              {selected.photos.map((photo) => (
                <Image key={photo.id} source={{ uri: photo.uri }} resizeMode="contain" style={{ width: '100%', height: 240 }} />
              ))}
            </ScrollView>
          ) : (
            <>
              <TextInput accessibilityLabel="일기 검색어" style={styles.input} value={query} onChangeText={setQuery}
                placeholder="일기 내용을 입력해주세요" placeholderTextColor="#999" autoFocus={mode === 'search'} />
              {mode === 'calendar' && <TextInput accessibilityLabel="일기 날짜" style={styles.input}
                value={date} onChangeText={setDate} placeholder="YYYY-MM-DD (예: 2026-11-05)" placeholderTextColor="#999" maxLength={10} />}
              {!validDate && <Text style={styles.muted}>날짜를 YYYY-MM-DD 형식으로 입력해주세요.</Text>}
              <ScrollView keyboardShouldPersistTaps="handled">
                {validDate && results.map((diary) => (
                  <Pressable key={diary.id} onPress={() => setSelected(diary)} style={styles.row}>
                    <Text style={styles.muted}>{new Date(diary.createdAt).toLocaleDateString('ko-KR')} · 사진 {diary.photos.length}장</Text>
                    <Text numberOfLines={2} style={[styles.text, { marginTop: 6 }]}>{diary.content}</Text>
                  </Pressable>
                ))}
                {validDate && results.length === 0 && <Text style={[styles.muted, { paddingVertical: 24 }]}>{diaries.length ? '검색 결과가 없어요.' : '아직 작성한 일기가 없어요. 오늘의 별을 띄워보세요.'}</Text>}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', paddingHorizontal: 20 },
  card: { backgroundColor: '#1e1e24', borderWidth: 1, borderColor: '#888', borderRadius: 20, padding: 22, maxHeight: '90%', width: '100%', maxWidth: 500, alignSelf: 'center', flexShrink: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: DesignPaint.ink, fontFamily: DesignFonts.bold, fontSize: 20 },
  text: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, fontSize: 16 },
  muted: { color: '#bbb', fontFamily: DesignFonts.regular, fontSize: 13 },
  close: { padding: 8 },
  input: { borderWidth: 1, borderColor: '#666', borderRadius: 10, padding: 12, color: '#fff', marginBottom: 12, fontSize: 16 },
  row: { borderBottomWidth: 1, borderBottomColor: '#444', paddingVertical: 16 },
});
