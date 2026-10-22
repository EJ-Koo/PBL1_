// origin/fffju(front 브랜치 연장) 커밋 "그룹 우주 화면 구성"의 mockup(frontend/src/app/index.jsx,
// @ts-nocheck, 하드코딩 데이터, 백엔드 연동 없음)을 이 저장소의 실제 구조로 포팅.
// 다른 유저와의 그룹 멤버십/초대는 아직 미정이라 구현하지 않음 — 그룹은 "내 일기를 모아 보는
// 묶음" 정도로만 동작 (diary_groups가 자기 자신의 일기만 태그).
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

// 그룹 미리보기 카드 안에서 별을 흩어 보일 2D 위치 (실제 좌표는 3D라 미리보기용으로만 씀)
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
    <View style={styles.container}>
      <Text style={styles.title}>우리의 우주</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {groups.map((group) => {
          const groupStars = entries.filter((e) => group.diary_ids.includes(e.id));
          return (
            <Pressable
              key={group.id}
              style={styles.card}
              onPress={() => router.push(`/groups/${group.id}` as Parameters<typeof router.push>[0])}
            >
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
              <View style={styles.cardFooter}>
                <Text style={styles.cardName}>{group.name}</Text>
                <Text style={styles.cardCount}>★ {groupStars.length}</Text>
              </View>
            </Pressable>
          );
        })}

        <Pressable style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ 새 그룹 우주 만들기</Text>
        </Pressable>
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
              <Pressable style={styles.modalCancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable style={styles.modalConfirmButton} onPress={handleCreate} disabled={isCreating}>
                <Text style={styles.modalConfirmText}>{isCreating ? '생성 중...' : '생성하기'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20, backgroundColor: '#05050A' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  scrollContent: { paddingBottom: 90 },
  card: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 22, padding: 12, marginBottom: 18 },
  preview: {
    width: '100%',
    height: 150,
    backgroundColor: '#08080c',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 10,
  },
  previewStar: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  cardName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  cardCount: { color: '#9C9CC0', fontSize: 13, fontWeight: '600' },
  addButton: {
    borderWidth: 1,
    borderColor: '#2A2A45',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  addButtonText: { color: '#9C9CC0', fontSize: 14, fontWeight: '600' },

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
  modalCancelButton: { backgroundColor: '#444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalCancelText: { color: '#fff', fontWeight: 'bold' },
  modalConfirmButton: { backgroundColor: '#3498db', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalConfirmText: { color: '#fff', fontWeight: 'bold' },
});
