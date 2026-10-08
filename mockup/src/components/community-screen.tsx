// front 브랜치 frontend/src/app/index.jsx의 'community' + 'write_post' 화면을 그대로 이식.
// 아직 실제 게시물 연동 없음 — 하드코딩된 더미 피드 그대로. "자랑하기"는 로컬 state로
// 피드/글쓰기 뷰만 토글하며, 실제 게시물 저장은 하지 않음(원본과 동일하게 알림만 띄움).
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { showNotice } from '@/lib/notice';

const POSTS = [
  {
    id: '1',
    author: '지구용사',
    likes: 97,
    comments: [
      { author: '지우용사', text: '우와 이뻐용' },
      { author: '지구용사_567', text: '멋있어요 잘 보고 갑니다' },
    ],
  },
  { id: '2', author: '우주용사', likes: 67, comments: [] },
];

export function CommunityScreen() {
  const [view, setView] = useState<'feed' | 'write'>('feed');

  if (view === 'write') {
    return <WritePostView onCancel={() => setView('feed')} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✨ 다른 우주 구경하기</Text>
        <Pressable style={styles.bragButton} onPress={() => setView('write')}>
          <Text style={styles.bragButtonText}>+ 자랑하기</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {POSTS.map((post) => (
          <View key={post.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.profileCircleOuter}>
                <View style={styles.profileCircleInner} />
              </View>
              <Text style={styles.author}>{post.author}</Text>
            </View>

            <View style={styles.imagePlaceholder}>
              {post.id === '1' && (
                <Text style={styles.imageText}>own space capture{'\n'}picture</Text>
              )}
            </View>

            <View style={styles.actions}>
              <Text style={styles.actionIcon}>🤍 {post.likes}</Text>
              <Text style={styles.actionIcon}>💬 {post.comments.length}</Text>
            </View>

            {post.comments.length > 0 && (
              <View style={styles.commentSection}>
                {post.comments.map((comment, i) => (
                  <View key={i} style={styles.commentRow}>
                    <Text style={styles.commentAuthor}>{comment.author}</Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function WritePostView({ onCancel }: { onCancel: () => void }) {
  return (
    <View style={styles.writeContainer}>
      <View style={styles.writeHeader}>
        <Pressable onPress={onCancel}>
          <Text style={styles.writeCancelText}>취소</Text>
        </Pressable>
        <Text style={styles.writeHeaderTitle}>새 게시물</Text>
        <Pressable
          onPress={() => {
            showNotice('공유 완료', '성공적으로 우주에 공유되었습니다!');
            onCancel();
          }}
        >
          <Text style={styles.writeShareText}>공유</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.writeScroll}>
        <View style={styles.writeImagePlaceholder}>
          <Text style={styles.writeImageText}>+ 캡처한 우주 사진 추가</Text>
        </View>
        <TextInput
          style={styles.writeInput}
          multiline
          placeholder="나의 우주에 대해 자랑해보세요..."
          placeholderTextColor="#555"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 15, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bragButton: { backgroundColor: '#cfd8dc', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5 },
  bragButtonText: { color: '#000', fontWeight: 'bold', fontSize: 14 },

  scroll: { marginBottom: 80 },
  card: {
    backgroundColor: '#000',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  profileCircleOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  profileCircleInner: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#555' },
  author: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  imagePlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#57606f',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  imageText: { color: '#fff', textAlign: 'center', fontSize: 14 },

  actions: { flexDirection: 'row', gap: 20, marginBottom: 15 },
  actionIcon: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  commentSection: { marginTop: 5 },
  commentRow: { flexDirection: 'row', marginBottom: 8 },
  commentAuthor: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginRight: 10, width: 90 },
  commentText: { color: '#dcdde1', fontSize: 14, flex: 1 },

  writeContainer: { flex: 1, backgroundColor: '#000', paddingTop: 20 },
  writeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  writeCancelText: { color: '#fff', fontSize: 16 },
  writeHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', paddingTop: 60 },
  writeShareText: { color: '#3498db', fontSize: 16, fontWeight: 'bold' },
  writeScroll: { flex: 1 },
  writeImagePlaceholder: {
    width: '100%',
    height: 350,
    backgroundColor: '#1e1e24',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  writeImageText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  writeInput: { color: '#fff', fontSize: 16, paddingHorizontal: 15, height: 150, textAlignVertical: 'top' },
});
