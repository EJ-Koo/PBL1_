import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useDiary } from '@/store/diary-context';

function dateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

/** Read-only history keeps the composer mounted, preserving its unsaved draft. */
export function DiaryHistory({ onClose }: { onClose: () => void }) {
  const { entries, dataLoading, loadError, retryLoad } = useDiary();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sorted = useMemo(() => [...entries].sort((a, b) => b.createdAt - a.createdAt), [entries]);
  const selected = entries.find(entry => entry.id === selectedId);
  const back = () => selected ? setSelectedId(null) : onClose();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={back}>
      <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.panel} accessibilityViewIsModal>
          <View style={styles.header}>
            {selected ? <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={styles.button}>
              <Text style={styles.text}>‹ 목록</Text>
            </Pressable> : <Text accessibilityRole="header" style={[styles.text, styles.title]}>지난 기록</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel="지난 기록 닫기" onPress={onClose} style={styles.button}>
              <Text style={styles.text}>닫기 ×</Text>
            </Pressable>
          </View>
          {dataLoading ? <View style={styles.content}>
            <ActivityIndicator color={DesignPaint.ink} accessibilityLabel="기록 불러오는 중" />
            <Text style={[styles.text, styles.empty]}>기록을 불러오고 있어요.</Text>
          </View> : loadError ? <View style={styles.content}>
            <Text accessibilityRole="alert" style={styles.text}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={retryLoad} style={styles.button}>
              <Text style={styles.text}>다시 시도</Text>
            </Pressable>
          </View> : selected ? (
            <ScrollView key={selected.id} contentContainerStyle={styles.content}>
              <Text style={[styles.text, styles.date]}>{dateLabel(selected.createdAt)}</Text>
              <Text selectable style={[styles.text, styles.body]}>{selected.text}</Text>
              {selected.photos.map((photo, index) => <Image key={photo.id} source={{ uri: photo.uri }}
                accessibilityLabel={`일기 사진 ${index + 1}`} resizeMode="contain" style={styles.photo} />)}
            </ScrollView>
          ) : (
            <FlatList data={sorted} keyExtractor={item => item.id} contentContainerStyle={styles.content}
              ListEmptyComponent={<Text style={[styles.text, styles.empty]}>아직 저장된 기록이 없어요.{'\n'}오늘의 이야기를 별로 남겨보세요.</Text>}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`${dateLabel(item.createdAt)} 기록 보기`}
                  onPress={() => setSelectedId(item.id)} style={styles.entry}>
                  <Text style={[styles.text, styles.date]}>{dateLabel(item.createdAt)}</Text>
                  <Text style={[styles.text, styles.body]} numberOfLines={2}>{item.text}</Text>
                  {item.photos.length > 0 && <Text style={styles.muted}>사진 {item.photos.length}장</Text>}
                </Pressable>
              )} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000b', paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 600, height: '85%', backgroundColor: DesignPaint.background, borderColor: DesignPaint.ink, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomColor: '#ffffff40', borderBottomWidth: 1 },
  button: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  text: { color: DesignPaint.ink, fontFamily: DesignFonts.regular, fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  content: { padding: 20 },
  entry: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#ffffff40' },
  date: { fontWeight: '700', marginBottom: 12 },
  body: { lineHeight: 26 },
  muted: { color: '#bbb', marginTop: 10 },
  empty: { textAlign: 'center', lineHeight: 28, paddingVertical: 32 },
  photo: { width: '100%', height: 240, marginTop: 16 },
});
