// fffju(frontend/src/app/index.jsx)의 'group'(우리의 우주) 화면 디자인을 그대로 가져옴.
// 데이터는 하드코딩 대신 실제 백엔드(그룹/일기)를 사용. 다른 유저와의 멤버십/초대는 아직 미정.
import { useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

type BgDot = { id: number; top: `${number}%`; left: `${number}%`; size: number; opacity: number };

const BG_DOTS: BgDot[] = Array.from({ length: 18 }).map((_, i) => ({
  id: i,
  top: `${(i * 29) % 100}%`,
  left: `${(i * 47) % 100}%`,
  size: (i % 3) + 1,
  opacity: ((i % 5) + 2) * 0.12,
}));

function previewPosition(index: number): { top: `${number}%`; left: `${number}%` } {
  return {
    top: `${30 + ((index * 25) % 50)}%`,
    left: `${25 + ((index * 30) % 55)}%`,
  };
}

export function GroupsScreen() {
  const { groups, entries, createGroup } = useDiary();
  const [modalVisible, setModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const result = await createGroup(newGroupName.trim() || `그룹${groups.length + 1}`);
    setIsCreating(false);
    if (result.ok) {
      setNewGroupName('');
      setModalVisible(false);
    } else {
      showNotice('그룹 생성 실패', result.error);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.headerTitle}>우리의 우주</Text>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => {
          const groupStars = entries.filter((e) => group.diary_ids.includes(e.id));
          const activeStarCount = Math.min(groupStars.length, 5);
          return (
            <Pressable
              key={group.id}
              style={styles.card}
              onPress={() => router.push(`/groups/${group.id}` as Parameters<typeof router.push>[0])}
            >
              {/* 카드 상단: 그룹 우주 미리보기 */}
              <View style={styles.preview}>
                {BG_DOTS.map((dot) => (
                  <View
                    key={dot.id}
                    style={{
                      position: 'absolute',
                      top: dot.top,
                      left: dot.left,
                      width: dot.size,
                      height: dot.size,
                      borderRadius: dot.size / 2,
                      backgroundColor: '#fff',
                      opacity: dot.opacity,
                    }}
                  />
                ))}
                {groupStars.map((star, idx) => (
                  <View
                    key={star.id}
                    style={[
                      styles.previewStar,
                      { ...previewPosition(idx), backgroundColor: star.color, shadowColor: star.color },
                    ]}
                  />
                ))}
              </View>

              {/* 카드 하단: 그룹 이름 + 별 진행도 (오른쪽부터 연두색으로 채움) */}
              <View style={styles.cardFooter}>
                <Text style={styles.cardName}>{group.name}</Text>
                <View style={styles.starIconsRow}>
                  {[0, 1, 2, 3, 4].map((starIdx) => {
                    const isNeon = starIdx >= 5 - activeStarCount;
                    return (
                      <Text
                        key={starIdx}
                        style={[styles.footerStar, isNeon ? styles.neonGreenStar : styles.darkStar]}
                      >
                        ★
                      </Text>
                    );
                  })}
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* 새 그룹 추가 동그란 버튼 */}
        <View style={styles.addBtnWrapper}>
          <Pressable style={styles.addCircleBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.addPlusText}>+</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal transparent visible={modalVisible} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>🪐 새로운 그룹 우주 만들기</Text>
            <Text style={styles.modalDesc}>
              일기를 작성할 때 그룹을 선택하면 내 우주와 그룹 우주에 함께 별이 떠요!
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={`그룹 이름 (비워두면 '그룹${groups.length + 1}')`}
              placeholderTextColor="#888"
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.whiteText}>취소</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmBtn} onPress={handleCreate} disabled={isCreating}>
                <Text style={styles.modalConfirmText}>{isCreating ? '생성 중...' : '생성하기'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// fffju 'group' 화면 스타일 그대로.
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 75,
    paddingBottom: 100,
    paddingHorizontal: 22,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 22 },
  listScroll: { flex: 1 },
  card: { backgroundColor: '#9e9e9e', borderRadius: 22, padding: 12, marginBottom: 22 },
  preview: {
    width: '100%',
    height: 155,
    backgroundColor: '#08080c',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 10,
  },
  previewStar: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  cardName: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  starIconsRow: { flexDirection: 'row', gap: 6 },
  footerStar: { fontSize: 18 },
  neonGreenStar: { color: '#76ff03' },
  darkStar: { color: '#1a1a1a' },
  addBtnWrapper: { alignItems: 'center', marginTop: 10, marginBottom: 30 },
  addCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#787878',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPlusText: { color: '#ccc', fontSize: 30, fontWeight: '300', lineHeight: 34 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: '82%',
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalDesc: { color: '#a4b0be', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  modalInput: {
    backgroundColor: '#111115',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { backgroundColor: '#444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  whiteText: { color: '#fff', fontWeight: 'bold' },
  modalConfirmBtn: { backgroundColor: '#3498db', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalConfirmText: { color: '#fff', fontWeight: 'bold' },
});
