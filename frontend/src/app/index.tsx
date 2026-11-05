// [MODIFIED 2026-11-05] fffju 브랜치 index.jsx의 화면 구성·디자인으로 교체하고, 데이터는 서버(로그인)로 연결.
//  - 화면: 가운데=나의 우주 / 왼쪽=일기 작성 / 오른쪽=그룹 우주 / 상점 (fffju 하단 네비·HUD·퀘스트 그대로)
//  - 별·일기·그룹: 서버(useDiary). fffju의 기기 저장(useJournal)은 사용하지 않는다.
//  - 별을 누르면 행성 상세(/planet/[id]), 메뉴의 검색·달력은 검색 화면(/search)으로 간다.
//  - 서버 기능이 아직 없는 코인·상점·테마·소리·알림은 화면만 보여주고 반응하지 않는다(나중에 하나씩 연결).
//  - 폰은 fffju 배율 그대로, 웹·PC는 폭 최대 520px 가운데 정렬(useDesignFrame).
import { useEffect, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import {
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryComposer } from '@/components/diary-composer';
import { GroupSpaceScreen } from '@/components/ui/group-space-screen';
import { HomeHud } from '@/components/ui/home-hud';
import { QuestPanel } from '@/components/ui/quest-panel';
import { UniverseBottomNav } from '@/components/ui/universe-bottom-nav';
import { UniverseCanvas } from '@/components/universe-scene';
import { DesignPaint } from '@/constants/ui-design';
import { useDesignFrame } from '@/hooks/use-design-frame';
import { showMessage } from '@/lib/feedback';
import { localDateKey } from '@/lib/journal';
import { getRotateSensitivity, loadSettings, setRotateSensitivity } from '@/lib/settings';
import { useDiary } from '@/store/diary-context';

type Screen = 'home' | 'diary' | 'group' | 'shop';

// 코인은 아직 서버에 없다 — fffju 기본값을 화면에만 보여준다.
const COINS_PLACEHOLDER = 999;

const SHOP_ITEMS = [
  { id: 'prism', icon: '❄️', name: '프리즘', desc: '연속 출석 멈춤을 1회 방어할 수 있다.', price: 30 },
  { id: 'blue', icon: '🌌', name: '배경 (blue)', desc: '나의 우주 배경을 바꿀 수 있다.', price: 50 },
  { id: 'comet', icon: '☄️', name: '혜성', desc: '5초마다 나의 우주에 혜성이 떨어진다.', price: 30 },
  { id: 'black', icon: '🌃', name: '배경 (black)', desc: '나의 우주 배경을 바꿀 수 있다.', price: 50 },
];

/** fffju 디자인 영역: 폰은 화면 전체 폭, 넓은 화면은 최대 520px로 가운데. */
function Frame({ width, children, box = false }: { width: number; children: ReactNode; box?: boolean }) {
  return (
    <View style={styles.frameOuter} pointerEvents={box ? 'box-none' : 'auto'}>
      <View style={[styles.frameInner, { width }]} pointerEvents={box ? 'box-none' : 'auto'}>
        {children}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { isLoggedIn, entries, groups, createGroup, logout } = useDiary();
  const { frameWidth, scale } = useDesignFrame();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>('home');
  const [questVisible, setQuestVisible] = useState(false);
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState(getRotateSensitivity());
  const [today, setToday] = useState(() => localDateKey(new Date()));

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn]);

  // 기기에 저장된 회전 민감도를 불러와 메뉴 슬라이더에 반영한다.
  useEffect(() => {
    let alive = true;
    loadSettings().then(() => {
      if (alive) setSensitivity(getRotateSensitivity());
    });
    return () => {
      alive = false;
    };
  }, []);

  // 자정이 지나면 퀘스트의 "오늘"을 갱신한다 (fffju 동작 유지).
  useEffect(() => {
    const timer = setInterval(() => setToday(localDateKey(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);

  if (!isLoggedIn) return <View style={styles.container} />;

  const checkCount = new Set(entries.map((e) => localDateKey(new Date(e.createdAt)))).size;
  const todayComplete = entries.some((e) => localDateKey(new Date(e.createdAt)) === today);
  const groupEntries = (diaryIds: string[]) => entries.filter((e) => diaryIds.includes(e.id));
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleCreateGroup = async () => {
    if (creatingGroup) return;
    setCreatingGroup(true);
    const result = await createGroup(newGroupName.trim() || `그룹${groups.length + 1}`);
    setCreatingGroup(false);
    if (!result.ok) {
      showMessage('그룹 생성 실패', result.error);
      return;
    }
    setNewGroupName('');
    setCreateGroupVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* ===== 가운데: 나의 우주 ===== */}
      {screen === 'home' && (
        <ImageBackground
          source={require('../../assets/images/night-sky.png')}
          resizeMode="cover"
          style={styles.fill}>
          <UniverseCanvas entries={entries} onStarPress={(id) => router.push(`/planet/${id}`)} />

          {entries.length === 0 && (
            <View style={styles.emptyState} pointerEvents="none">
              <Text style={styles.emptyText}>아직 기록이 없어요.{'\n'}아래 왼쪽 버튼으로 첫 별을 띄워보세요.</Text>
            </View>
          )}

          <Frame width={frameWidth} box>
            <HomeHud
              scale={scale}
              starCount={entries.length}
              coinCount={COINS_PLACEHOLDER}
              checkCount={checkCount}
              onStats={() => setScreen('shop')}
              onQuest={() => setQuestVisible(true)}
              menuProps={{
                onSearch: () => router.push('/search'),
                onCalendar: () => router.push('/search?calendar=1'),
                onLogout: handleLogout,
                sensitivity,
                onSensitivity: (value) => setSensitivity(setRotateSensitivity(value)),
              }}
            />
          </Frame>
        </ImageBackground>
      )}

      {/* ===== 왼쪽: 일기 작성 — 다른 탭에 갔다 와도 쓰던 내용이 남도록 화면을 숨기기만 한다 ===== */}
      <View style={[styles.fill, screen !== 'diary' && styles.hidden]}>
        <Frame width={frameWidth}>
          <DiaryComposer scale={scale} onBack={() => setScreen('home')} onSaved={() => setScreen('home')} />
        </Frame>
      </View>

      {/* ===== 오른쪽: 그룹 우주 ===== */}
      {screen === 'group' && (
        <Frame width={frameWidth}>
          <GroupSpaceScreen
            scale={scale}
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              stars: groupEntries(g.diary_ids).map((e) => ({
                color: e.color,
                size: 0.36,
                // 카드 미리보기 위치: 3D 위치(x, y)를 카드 안 비율로 옮긴다 (별 배치 반경 최대 약 12).
                previewX: `${Math.round(50 + Math.max(-1, Math.min(1, e.position[0] / 12)) * 40)}%`,
                previewY: `${Math.round(50 - Math.max(-1, Math.min(1, e.position[1] / 12)) * 40)}%`,
              })),
            }))}
            onSelectGroup={(g) => setActiveGroupId(g.id)}
            onAddGroup={() => setCreateGroupVisible(true)}
          />
        </Frame>
      )}

      {/* ===== 상점 (코인 기능이 서버에 생기기 전까지 보기만 가능) ===== */}
      {screen === 'shop' && (
        <Frame width={frameWidth}>
          <View style={styles.shopContainer}>
            <View style={styles.shopHeader}>
              <Text style={styles.shopTitle}>🛍️ 상점</Text>
              <View style={styles.shopCoinPill}>
                <Text style={styles.shopCoinText}>🪙 {COINS_PLACEHOLDER}</Text>
              </View>
            </View>
            <ScrollView style={styles.shopScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.shopGrid}>
                {SHOP_ITEMS.map((item) => (
                  <View key={item.id} style={styles.shopItemCard}>
                    <Text style={styles.shopItemIcon}>{item.icon}</Text>
                    <Text style={styles.shopItemName}>{item.name}</Text>
                    <Text style={styles.shopItemDesc}>{item.desc}</Text>
                    <Text style={styles.shopPriceText}>🪙 {item.price}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </Frame>
      )}

      {/* ===== 새 그룹 만들기 ===== */}
      <Modal transparent visible={createGroupVisible} animationType="fade" onRequestClose={() => setCreateGroupVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreateGroupVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.inviteModalCard, { width: Math.min(frameWidth * 0.82, 420) }]}>
            <Text style={styles.inviteModalTitle}>🪐 새로운 그룹 우주 만들기</Text>
            <Text style={styles.inviteModalDesc}>
              일기를 작성할 때 그룹을 선택하면 내 우주와 그룹 우주에 함께 별이 떠요!
            </Text>
            <TextInput
              style={styles.inviteInput}
              placeholder={`그룹 이름 (비워두면 '그룹${groups.length + 1}')`}
              placeholderTextColor="#888"
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <View style={styles.inviteModalButtonRow}>
              <TouchableOpacity style={styles.inviteCancelBtn} onPress={() => setCreateGroupVisible(false)}>
                <Text style={styles.whiteText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inviteConfirmBtn} onPress={handleCreateGroup} disabled={creatingGroup}>
                <Text style={styles.inviteConfirmText}>{creatingGroup ? '만드는 중…' : '생성하기'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ===== 그룹 카드를 눌렀을 때: 그 그룹의 우주를 3D로 크게 보기 ===== */}
      <Modal transparent={false} visible={activeGroup !== null} animationType="slide" onRequestClose={() => setActiveGroupId(null)}>
        {activeGroup && (
          <ImageBackground
            source={require('../../assets/images/night-sky.png')}
            resizeMode="cover"
            style={styles.fill}>
            <UniverseCanvas
              entries={groupEntries(activeGroup.diary_ids)}
              onStarPress={(id) => {
                setActiveGroupId(null);
                router.push(`/planet/${id}`);
              }}
            />
            {activeGroup.diary_ids.length === 0 && (
              <View style={styles.emptyState} pointerEvents="none">
                <Text style={styles.emptyText}>아직 이 그룹에 공유된 별이 없어요.</Text>
              </View>
            )}
            <Frame width={frameWidth} box>
              <View style={[styles.topBar, { top: insets.top + 20 }]} pointerEvents="box-none">
                <TouchableOpacity style={styles.questButton} onPress={() => setActiveGroupId(null)}>
                  <Text style={styles.questText}>{'< 목록으로'}</Text>
                </TouchableOpacity>
                <View style={styles.statsPill}>
                  <Text style={styles.statsText}>
                    {activeGroup.name}의 우주 (★ {groupEntries(activeGroup.diary_ids).length})
                  </Text>
                </View>
                <View style={{ width: 60 }} />
              </View>
            </Frame>
          </ImageBackground>
        )}
      </Modal>

      {/* ===== 퀘스트 (진행률은 오늘 일기 작성 여부만 실제 값) ===== */}
      <Modal transparent visible={questVisible} animationType="fade" onRequestClose={() => setQuestVisible(false)}>
        <Pressable style={styles.frameOuter} onPress={() => setQuestVisible(false)}>
          <View style={[styles.frameInner, { width: frameWidth }]}>
            <QuestPanel scale={scale} todayComplete={todayComplete} onClose={() => setQuestVisible(false)} />
          </View>
        </Pressable>
      </Modal>

      {/* ===== 공통: 하단 네비게이션 (왼쪽=일기 / 가운데=나의 우주 / 오른쪽=그룹) ===== */}
      <Frame width={frameWidth} box>
        <UniverseBottomNav
          scale={scale}
          onDiary={() => setScreen('diary')}
          onHome={() => setScreen('home')}
          onGroup={() => setScreen('group')}
        />
      </Frame>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DesignPaint.background },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hidden: { display: 'none' },
  frameOuter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' },
  frameInner: { flex: 1 },
  whiteText: { color: '#fff' },
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
  emptyText: { color: '#A4B0BE', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  topBar: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
  },
  statsPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12 },
  statsText: { fontWeight: 'bold', color: '#111', fontSize: 14 },
  questButton: { backgroundColor: '#7f8c8d', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  questText: { fontWeight: 'bold', color: '#111', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  inviteModalCard: {
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#333',
  },
  inviteModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  inviteModalDesc: { color: '#a4b0be', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  inviteInput: {
    backgroundColor: '#111115', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
  },
  inviteModalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  inviteCancelBtn: { backgroundColor: '#444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  inviteConfirmBtn: { backgroundColor: '#3498db', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  inviteConfirmText: { color: '#fff', fontWeight: 'bold' },

  shopContainer: { flex: 1, backgroundColor: '#000', paddingTop: 60, paddingHorizontal: 20 },
  shopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  shopTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  shopCoinPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  shopCoinText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  shopScroll: { flex: 1, marginBottom: 80 },
  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  shopItemCard: { backgroundColor: '#b2bec3', width: '48%', borderRadius: 10, padding: 15, alignItems: 'center', marginBottom: 15 },
  shopItemIcon: { fontSize: 50, marginBottom: 15 },
  shopItemName: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#000' },
  shopItemDesc: { fontSize: 10, color: '#2d3436', textAlign: 'center', marginBottom: 20, minHeight: 30 },
  shopPriceText: { fontWeight: 'bold', fontSize: 16, color: '#000' },
});
