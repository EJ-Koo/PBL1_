// [MODIFIED 2026-11-05] fffju 브랜치 index.jsx의 화면 구성·디자인으로 교체하고, 데이터는 서버(로그인)로 연결.
//  - 화면: 가운데=나의 우주 / 왼쪽=일기 작성 / 오른쪽=그룹 우주 / 상점 (fffju 하단 네비·HUD·퀘스트 그대로)
//  - 별·일기·그룹: 서버(useDiary). fffju의 기기 저장(useJournal)은 사용하지 않는다.
//  - 별을 누르면 행성 상세(/planet/[id]), 메뉴의 검색·달력은 검색 화면(/search)으로 간다.
//  - 서버 기능이 아직 없는 테마·소리·알림은 화면만 보여주고 반응하지 않는다(나중에 하나씩 연결).
//  - [MODIFIED 2026-11-07] 코인·상점은 서버 연결(useShop). HUD 코인을 누르면 상점, 장착한 배경·혜성이 나의 우주에 보인다.
//  - 폰은 fffju 배율 그대로, 웹·PC는 폭 최대 520px 가운데 정렬(useDesignFrame).
import { useEffect, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryComposer } from '@/components/diary-composer';
import { SearchScreen } from '@/components/search-screen';
import { PopupWindow } from '@/components/ui/popup-window';
import { BackgroundTint, CometLayer } from '@/components/item-effects';
import { ShopSheet } from '@/components/shop-screen';
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
import { useShop } from '@/store/shop-context';

type Screen = 'home' | 'diary' | 'group';

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
  const { isLoggedIn, entries, groups, createGroup, joinGroup, leaveGroup, logout } = useDiary();
  const { coins, activeEffects, refresh: refreshShop } = useShop();
  const { frameWidth, scale } = useDesignFrame();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>('home');
  const [questVisible, setQuestVisible] = useState(false);
  // [MODIFIED 2026-11-10] 상점은 별도 화면이 아니라 아래에서 올라오는 팝업
  const [shopVisible, setShopVisible] = useState(false);
  // [ADDED 2026-11-12] 검색 팝업: null=닫힘, keyword=키워드 검색, calendar=달력으로 열기.
  // 열 때마다 key 를 바꿔 새로 시작하고, 행성 상세에 갔다 와도 닫지 않아 검색어·결과가 남는다.
  const [searchPopup, setSearchPopup] = useState<{ mode: 'keyword' | 'calendar'; key: number } | null>(null);
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
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

  const handleJoinGroup = async () => {
    if (joining) return;
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    const result = await joinGroup(code);
    setJoining(false);
    if (!result.ok) {
      showMessage('참여 실패', result.error);
      return;
    }
    setJoinCode('');
    setJoinVisible(false);
  };

  const handleLeaveGroup = async () => {
    if (leaving || !activeGroup) return;
    setLeaving(true);
    const result = await leaveGroup(activeGroup.id);
    setLeaving(false);
    if (!result.ok) {
      showMessage('나가기 실패', result.error);
      return;
    }
    setConfirmLeave(false);
    setInviteVisible(false);
    setActiveGroupId(null); // 상세 화면도 닫는다
  };

  // 초대 코드(방 ID) 복사: 웹에선 클립보드, 네이티브에선 안내만. (clipboard 모듈 의존성 추가 안 함)
  const copyInviteCode = () => {
    const code = activeGroup?.invite_code;
    if (!code) return;
    const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => unknown } } }).navigator?.clipboard;
    clip?.writeText?.(code);
    showMessage('초대 코드', `${code} — 친구에게 이 코드를 보내 참여하게 하세요.`);
  };

  return (
    <View style={styles.container}>
      {/* ===== 가운데: 나의 우주 ===== */}
      {screen === 'home' && (
        // [MODIFIED 2026-11-12] 배경 사진(night-sky.png) 제거 → 단색 배경 + 3D 우주의 배경 별만 사용
        <View style={[styles.fill, styles.spaceBackground]}>
          <BackgroundTint effects={activeEffects} />
          <UniverseCanvas entries={entries} onStarPress={(id) => router.push(`/planet/${id}`)} />
          <CometLayer effects={activeEffects} />

          {entries.length === 0 && (
            <View style={styles.emptyState} pointerEvents="none">
              <Text style={styles.emptyText}>아직 기록이 없어요.{'\n'}아래 왼쪽 버튼으로 첫 별을 띄워보세요.</Text>
            </View>
          )}

          <Frame width={frameWidth} box>
            <HomeHud
              scale={scale}
              starCount={entries.length}
              coinCount={coins ?? 0}
              checkCount={checkCount}
              onStats={() => {
                refreshShop();
                setShopVisible(true);
              }}
              onQuest={() => setQuestVisible(true)}
              menuProps={{
                onSearch: () => setSearchPopup({ mode: 'keyword', key: Date.now() }),
                onCalendar: () => setSearchPopup({ mode: 'calendar', key: Date.now() }),
                onLogout: handleLogout,
                sensitivity,
                onSensitivity: (value) => setSensitivity(setRotateSensitivity(value)),
              }}
            />
          </Frame>
        </View>
      )}

      {/* ===== 왼쪽: 일기 작성 — 다른 탭에 갔다 와도 쓰던 내용이 남도록 화면을 숨기기만 한다 ===== */}
      <View style={[styles.fill, screen !== 'diary' && styles.hidden]}>
        <Frame width={frameWidth}>
          <DiaryComposer scale={scale} onBack={() => setScreen('home')} onSaved={() => setScreen('home')} />
        </Frame>
      </View>

      {/* ===== 오른쪽: 그룹 우주 (반응형 그리드 — 전체 뷰포트, useResponsiveLayout 사용) ===== */}
      {screen === 'group' && (
        <View style={styles.fill}>
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
            onJoinByCode={() => setJoinVisible(true)}
          />
        </View>
      )}

      {/* ===== 상점 팝업 (HUD 코인을 누르면 열림, ✕ 또는 바깥을 누르면 닫힘) ===== */}
      <ShopSheet visible={shopVisible} width={frameWidth} onClose={() => setShopVisible(false)} />

      {/* ===== 그룹 카드를 눌렀을 때: 그 그룹의 우주를 3D로 크게 보기 ===== */}
      <Modal transparent={false} visible={activeGroup !== null} animationType="slide" onRequestClose={() => setActiveGroupId(null)}>
        {activeGroup && (
          <View style={[styles.fill, styles.spaceBackground]}>
            <UniverseCanvas
              sceneKey={`group-${activeGroup.id}`}
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
                <TouchableOpacity style={styles.inviteButton} onPress={() => { setConfirmLeave(false); setInviteVisible(true); }}>
                  <Text style={styles.inviteButtonText}>＋친구</Text>
                </TouchableOpacity>
              </View>
            </Frame>
          </View>
        )}
      </Modal>

      {/* ===== 그룹에 친구 초대 (방 ID 코드 공유 + 멤버 목록) ===== */}
      <Modal transparent visible={inviteVisible} animationType="fade" onRequestClose={() => setInviteVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInviteVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.inviteModalCard, { width: Math.min(frameWidth * 0.82, 420) }]}>
            <Text style={styles.inviteModalTitle}>🪐 친구 초대</Text>
            <Text style={styles.inviteModalDesc}>
              이 방 ID를 친구에게 보내세요. 친구가 그룹 목록에서 “코드로 참여”에 입력하면 함께 쓰는 우주가 돼요.
            </Text>
            <TouchableOpacity style={styles.codeBox} onPress={copyInviteCode}>
              <Text style={styles.codeText}>{activeGroup?.invite_code ?? ''}</Text>
              <Text style={styles.codeCopy}>탭하여 복사</Text>
            </TouchableOpacity>
            <Text style={styles.membersTitle}>멤버 {activeGroup?.members.length ?? 0}명</Text>
            {(activeGroup?.members ?? []).map((m) => (
              <Text key={m.user_id} style={styles.memberRow}>· {m.nickname ?? '익명'}</Text>
            ))}
            {confirmLeave ? (
              <View style={styles.leaveBox}>
                <Text style={styles.leaveWarn}>나가면 이 그룹이 목록에서 사라져요. 아무도 안 남으면 그룹이 삭제돼요.</Text>
                <View style={styles.inviteModalButtonRow}>
                  <TouchableOpacity style={styles.inviteCancelBtn} onPress={() => setConfirmLeave(false)}>
                    <Text style={styles.whiteText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.leaveConfirmBtn} onPress={handleLeaveGroup} disabled={leaving}>
                    <Text style={styles.whiteText}>{leaving ? '나가는 중…' : '나가기'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.leaveLink} onPress={() => setConfirmLeave(true)}>
                <Text style={styles.leaveLinkText}>그룹 나가기</Text>
              </TouchableOpacity>
            )}
            <View style={styles.inviteModalButtonRow}>
              <TouchableOpacity style={styles.inviteConfirmBtn} onPress={() => setInviteVisible(false)}>
                <Text style={styles.inviteConfirmText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ===== 코드로 그룹 참여 ===== */}
      <Modal transparent visible={joinVisible} animationType="fade" onRequestClose={() => setJoinVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setJoinVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.inviteModalCard, { width: Math.min(frameWidth * 0.82, 420) }]}>
            <Text style={styles.inviteModalTitle}>🚀 코드로 그룹 참여</Text>
            <Text style={styles.inviteModalDesc}>친구에게 받은 방 ID를 입력하면 그 그룹에 바로 참여해요.</Text>
            <TextInput
              style={styles.inviteInput}
              placeholder="방 ID (예: ABCD2345)"
              placeholderTextColor="#7f8c8d"
              autoCapitalize="characters"
              autoCorrect={false}
              value={joinCode}
              onChangeText={setJoinCode}
            />
            <View style={styles.inviteModalButtonRow}>
              <TouchableOpacity style={styles.inviteCancelBtn} onPress={() => setJoinVisible(false)}>
                <Text style={styles.whiteText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inviteConfirmBtn} onPress={handleJoinGroup} disabled={joining}>
                <Text style={styles.inviteConfirmText}>{joining ? '참여 중…' : '참여하기'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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

      {/* ===== 새 그룹 만들기 팝업 (✕ · 바깥 · 취소로 닫힘) ===== */}
      <PopupWindow
        visible={createGroupVisible}
        onClose={() => setCreateGroupVisible(false)}
        title="🪐 새로운 그룹 우주"
        width={Math.min(frameWidth, 444)}
        testID="group-create-popup">
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
      </PopupWindow>

      {/* ===== 일기 검색 팝업 (메뉴의 검색·달력에서 열림) ===== */}
      <PopupWindow
        visible={searchPopup !== null}
        onClose={() => setSearchPopup(null)}
        title={searchPopup?.mode === 'calendar' ? '날짜로 찾기' : '일기 검색'}
        width={frameWidth}
        height="80%"
        testID="search-popup">
        {searchPopup && (
          <SearchScreen
            key={searchPopup.key}
            embedded
            onBack={() => setSearchPopup(null)}
            onOpenEntry={(id) => router.push(`/planet/${id}`)}
            initialCalendarOpen={searchPopup.mode === 'calendar'}
          />
        )}
      </PopupWindow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DesignPaint.background },
  spaceBackground: { backgroundColor: '#000' },
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
  inviteButton: { backgroundColor: '#3498db', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  inviteButtonText: { fontWeight: 'bold', color: '#fff', fontSize: 13 },
  codeBox: { backgroundColor: '#1e272e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  codeText: { color: '#fff', fontSize: 26, fontWeight: 'bold', letterSpacing: 4 },
  codeCopy: { color: '#7f8c8d', fontSize: 12, marginTop: 4 },
  membersTitle: { color: '#a4b0be', fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  memberRow: { color: '#dfe6e9', fontSize: 14, marginBottom: 2 },
  leaveLink: { alignSelf: 'flex-start', marginTop: 14, paddingVertical: 4 },
  leaveLinkText: { color: '#e74c3c', fontSize: 14, fontWeight: '600' },
  leaveBox: { marginTop: 14, backgroundColor: 'rgba(231,76,60,0.12)', borderRadius: 10, padding: 12 },
  leaveWarn: { color: '#ffb8b0', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  leaveConfirmBtn: { backgroundColor: '#e74c3c', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },

});
