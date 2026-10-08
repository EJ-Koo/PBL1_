// [MODIFIED 2026-09-29] 원본: back_end_wodnjs 브랜치의 mockup/src/app/index.tsx (평면 그리드 형태).
// 여기에 front 브랜치 frontend/index.jsx의 3D 우주 디자인을 이식함. 자세한 변경 내용은
// mockup/CHANGES_FRONTEND.md 참고. 변경된 부분은 아래에 [MODIFIED] 주석으로 표시함.
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { CommunityScreen } from '@/components/community-screen';
import { ShopScreen } from '@/components/shop-screen';
import { UniverseCanvas } from '@/components/universe-scene';
import { useDiary } from '@/store/diary-context';

const { width, height } = Dimensions.get('window');
const PAGE_LABELS = ['상점', '나의 우주', '커뮤니티'];

export default function HomeScreen() {
  const { isLoggedIn } = useDiary();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(1);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn]);

  useEffect(() => {
    // 가운데(나의 우주) 페이지에서 시작
    scrollRef.current?.scrollTo({ x: width, y: 0, animated: false });
  }, []);

  if (!isLoggedIn) {
    return <View style={styles.container} />;
  }

  const goToPage = (index: number) => {
    scrollRef.current?.scrollTo({ x: width * index, y: 0, animated: true });
    setPageIndex(index);
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setPageIndex(index);
  };

  return (
    <View style={styles.pagerWrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: width, y: 0 }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
      >
        <View style={{ width, height }}>
          <ShopScreen />
        </View>
        <View style={{ width, height }}>
          <UniversePage />
        </View>
        <View style={{ width, height }}>
          <CommunityScreen />
        </View>
      </ScrollView>

      {/* [MODIFIED] 스와이프 외에, 화면 오른쪽 끝을 탭하면 다음 페이지로 넘어가는 보조 동작 추가.
          (요청: "스와이프 말고 오른쪽 화면으로 클릭을 하면 넘어가도록") */}
      {pageIndex < PAGE_LABELS.length - 1 && (
        <Pressable
          style={styles.nextZone}
          onPress={() => goToPage(pageIndex + 1)}
          pointerEvents="box-only"
        />
      )}

      {/* PC 웹은 마우스로 좌우 스와이프가 안 되므로, 클릭으로도 이동 가능하게 보조 버튼 제공 */}
      <View style={styles.dotsRow} pointerEvents="box-none">
        {PAGE_LABELS.map((label, index) => (
          <Pressable key={label} style={styles.dotButton} onPress={() => goToPage(index)}>
            <View style={[styles.dot, pageIndex === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// [MODIFIED] 원본은 FlatList로 별을 3열 그리드에 평면 배치했음.
// frontend/index.jsx의 3D 우주(react-three-fiber) 렌더링으로 통째로 교체.
function UniversePage() {
  const { entries } = useDiary();
  const [questVisible, setQuestVisible] = useState(false);

  return (
    <View style={styles.universeContainer}>
      <UniverseCanvas entries={entries} onStarPress={(id) => router.push(`/planet/${id}`)} />

      {entries.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyText}>아직 기록이 없어요.{'\n'}첫 별을 띄워보세요.</Text>
        </View>
      )}

      {/* 우주 위에 떠 있는 상단 바 */}
      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.statsPill}>
          <Text style={styles.statsText}>★ {entries.length}</Text>
        </View>
        <TouchableOpacity style={styles.questButton} onPress={() => setQuestVisible(true)}>
          <Text style={styles.questText}>퀘스트</Text>
        </TouchableOpacity>
      </View>

      <Pressable style={styles.fab} onPress={() => router.push('/write')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* [MODIFIED] 원래 frontend/index.jsx의 퀘스트 패널(진행률 바 포함)을 그대로 복원함.
          "커뮤니티"는 별도로 페이저의 세 번째 페이지(PlaceholderPage)로 옮김 — 이 버튼/모달은
          그대로 "퀘스트"를 가리킴. 실제 커뮤니티 기능 내용/디자인은 아직 미정. */}
      <Modal transparent visible={questVisible} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setQuestVisible(false)}>
          <View style={styles.questCard}>
            <Text style={styles.questCardTitle}>퀘스트</Text>
            <Text style={styles.questSectionTitle}>진행 중</Text>
            <View style={styles.questItem}>
              <Text style={styles.whiteText}>오늘의 별 띄우기</Text>
              <Text style={styles.whiteText}>★ 5</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '80%' }]} />
            </View>

            <View style={styles.questItem}>
              <Text style={styles.whiteText}>운석 3개 치우기</Text>
              <Text style={styles.whiteText}>★ 3</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '40%' }]} />
            </View>

            <Text style={styles.questSectionTitle}>진행 완료</Text>
            <View style={styles.questItem}>
              <Text style={styles.grayText}>친구 우주에 편지 보내기</Text>
              <Text style={styles.grayText}>★ 3</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '100%', backgroundColor: '#80e03e' }]} />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pagerWrap: {
    flex: 1,
    backgroundColor: '#0B0B1A',
  },
  pager: {
    flex: 1,
    backgroundColor: '#0B0B1A',
  },
  nextZone: {
    // 상단 퀘스트 버튼(top:60~100 부근), 하단 FAB(bottom:40~96 부근)과 겹치지 않도록
    // 화면 오른쪽 가장자리의 중간 구간만 탭 영역으로 사용
    position: 'absolute',
    top: 110,
    bottom: 100,
    right: 0,
    width: 50,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dotButton: {
    padding: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3A3A5A',
  },
  dotActive: {
    backgroundColor: '#7C6CF6',
    width: 18,
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
    paddingTop: 60,
  },
  universeContainer: {
    flex: 1,
    backgroundColor: '#05050A',
  },
  emptyState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#6E6E90',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  topBar: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statsText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  questButton: {
    backgroundColor: '#7C6CF6',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  questText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  whiteText: {
    color: '#FFFFFF',
  },
  grayText: {
    color: '#A4B0BE',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#80e03e',
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  questCard: {
    position: 'absolute',
    top: 120,
    right: 20,
    width: 220,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 20,
  },
  questCardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 15,
  },
  questSectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 15,
    marginBottom: 10,
  },
  questItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 40,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7C6CF6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: '0px 0px 12px rgba(124, 108, 246, 0.5)' },
      default: {
        shadowColor: '#7C6CF6',
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
    }),
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
  },
});
