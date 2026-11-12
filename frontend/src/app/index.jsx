// @ts-nocheck
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, ImageBackground, AppState, ActivityIndicator } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { Color } from 'three';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeHud } from '@/components/ui/home-hud';
import { DiaryWriteScreen } from '@/components/ui/diary-write-screen';
import { GroupSpaceScreen } from '@/components/ui/group-space-screen';
import { CreateGroupDialog } from '@/components/ui/create-group-dialog';
import { ShopScreen } from '@/components/ui/shop-screen';
import { SpaceButton } from '@/components/ui/space-ui';
import { GroupMemberStars } from '@/components/ui/group-member-stars';
import { UniverseBottomNav } from '@/components/ui/universe-bottom-nav';
import { QuestPanel } from '@/components/ui/quest-panel';
import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { JournalDialog } from '@/components/ui/journal-dialog';
import { useJournal } from '@/hooks/use-journal';
import { useUniverseAudio } from '@/hooks/use-universe-audio';
import { addDiary, MAX_PHOTOS, localDateKey, purchaseItem, rotationDelta, createGroup, selectDiaryAudience, getGroupAttendance, LOCAL_MEMBER } from '@/lib/journal';
import { pickPhotos, recoverPendingPhotos } from '@/lib/photos';
import { showMessage } from '@/lib/feedback';
import { hasReminderPermission, setDiaryReminder } from '@/lib/reminders';

// Radially faded light, rendered at the same 3D positions as the diary stars.
// The view-facing vertices keep the light round while the universe rotates.
const STAR_GLOW_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    center.xy += position.xy;
    gl_Position = projectionMatrix * center;
  }
`;
const STAR_GLOW_FRAGMENT = `
  uniform vec3 glowColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    float alpha = exp(-6.0 * r2) * (1.0 - smoothstep(0.8, 1.0, r2));
    gl_FragColor = vec4(glowColor, alpha);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------
// 🚀 [마법의 공책] 손가락으로 화면을 민 거리와 확대 정도를 기억해두는 곳이에요!
// ---------------------------------------------------------
let targetRotX = 0;
let targetRotY = 0;
let targetCameraZ = 5; // 기본 카메라 거리 (숫자가 작아질수록 확대, 커질수록 축소)

// 🌟 빛나는 구슬(별) 컴포넌트
function FloatingStar({ position, color, size, glow = false }) {
  const meshRef = useRef(null);
  const glowUniforms = useMemo(() => ({ glowColor: { value: new Color(color) } }), [color]);
  
  // 별이 제자리에서 아주 천천히 반짝거리게 두기
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <mesh position={position} ref={meshRef}>
      {glow ? (
        <>
          <planeGeometry args={[size * 2, size * 2]} />
          <shaderMaterial
            uniforms={glowUniforms}
            vertexShader={STAR_GLOW_VERTEX}
            fragmentShader={STAR_GLOW_FRAGMENT}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </>
      ) : (
        <>
          <sphereGeometry args={[size, 32, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} roughness={0.2} />
        </>
      )}
    </mesh>
  );
}

// 🌌 우주 공간 전체 컴포넌트 (개인 우주 & 모임 우주 공용)
function Comet() {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const phase = clock.getElapsedTime() % 5;
    ref.current.visible = phase < 1.2;
    ref.current.position.set(-3 + phase * 5, 3 - phase * 4, -2);
  });
  return <group ref={ref}>{Array.from({ length: 12 }, (_, i) => (
    <mesh key={i} position={[-i * 0.08, i * 0.065, 0]}>
      <sphereGeometry args={[0.045 * (1 - i / 14), 8, 8]} />
      <meshBasicMaterial color="#fff" transparent opacity={1 - i / 12} />
    </mesh>
  ))}</group>;
}

function UniverseScene({ stars, glow = false, comet = false }) {
  const groupRef = useRef(null);
  
  // 🔥 [핵심 기능] 매 프레임마다 한 손가락 회전 & 두 손가락 확대/축소를 부드럽게 적용해요!
  useFrame((state) => {
    if (groupRef.current) {
       groupRef.current.rotation.y += (targetRotX - groupRef.current.rotation.y) * 0.1;
       groupRef.current.rotation.x += (targetRotY - groupRef.current.rotation.x) * 0.1;
    }
    state.camera.position.z += (targetCameraZ - state.camera.position.z) * 0.1;
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      {comet && <Comet />}
      
      {stars.map((star, index) => (
        <FloatingStar
          key={index}
          position={star.position}
          color={star.color}
          size={star.size}
          glow={glow}
        />
      ))}
    </group>
  );
}

// 📱 메인 앱 화면
export default function App() {
  const insets = useSafeAreaInsets();
  const { scale: uiScale, contentLeft, contentWidth, headerTop, bottomSpace } = useResponsiveLayout();
  // 화면 상태: 'diary'(왼쪽 일기작성), 'home'(가운데 홈), 'group'(오른쪽 그룹우주), 'shop'(상점), 'community'(커뮤니티)
  const [currentScreen, setCurrentScreen] = useState('home');
  const [questVisible, setQuestVisible] = useState(false);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopMessage, setShopMessage] = useState('');

  const { data, update, commit, ready, error: storageError, reload } = useJournal();
  const { stars: myStars, groups, draft, diaries, settings } = data;
  const diaryText = draft.content;
  const selectedGroupIds = draft.groupIds;
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const photoLock = useRef(false);
  const photoRecoveryHandled = useRef(false);
  const [dialog, setDialog] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const notificationLock = useRef(false);
  const audio = useUniverseAudio(settings, ready);
  const [today, setToday] = useState(() => localDateKey(new Date()));
  const setDraft = (recipe) => {
    if (saveLock.current) return;
    void update((value) => ({ ...value, draft: recipe(value.draft) })).catch(() => {});
  };
  const setDiaryText = (content) => setDraft((value) => ({ ...value, content }));
  const reportError = (cause) => showMessage('확인해주세요', cause instanceof Error ? cause.message : '다시 시도해주세요.');
  const changeSetting = (key, value) => {
    audio.unlock();
    if (key === 'theme' && value !== 'original') { void buyItem(value); return; }
    void update((state) => ({ ...state, settings: { ...state.settings, [key]: value } })).catch(reportError);
    if (key === 'effectVolume') void audio.playEffect(value).catch(() => {});
  };
  const toggleNotifications = async () => {
    if (notificationLock.current) return;
    notificationLock.current = true;
    setNotificationBusy(true);
    const enabled = !settings.notifications;
    try {
      await setDiaryReminder(enabled);
      try {
        await commit((state) => ({ ...state, settings: { ...state.settings, notifications: enabled } }));
      } catch (cause) {
        await setDiaryReminder(!enabled);
        throw cause;
      }
      if (enabled) showMessage('알림 설정', '매일 오후 9시에 일기 작성 알림을 보내드릴게요.');
    } catch (cause) { reportError(cause); }
    finally { notificationLock.current = false; setNotificationBusy(false); }
  };
  const menuAction = (action) => {
    audio.unlock();
    if (['search', 'calendar'].includes(action)) setDialog(action);
    else if (action === 'logout' || action === 'delete-account') {
      showMessage('계정 연결 안내', '현재 화면은 로그인 없이 기기에 데이터를 저장하고 있어요. 연결된 계정이 없어 로그아웃·회원 탈퇴를 처리할 수 없어요.');
    } else if (action === 'terms') showMessage('이용약관', '아직 등록된 이용약관이 없어요.');
  };
  useEffect(() => {
    if (!ready || photoRecoveryHandled.current) return;
    photoRecoveryHandled.current = true;
    photoLock.current = true;
    void recoverPendingPhotos(MAX_PHOTOS - draft.photos.length).then(async (photos) => {
      if (photos.length) await update((state) => ({ ...state, draft: { ...state.draft, photos: [...state.draft.photos, ...photos].slice(0, MAX_PHOTOS) } }));
    }).catch(reportError).finally(() => { photoLock.current = false; });
  }, [ready, draft.photos.length, update]);
  useEffect(() => {
    if (!ready) return;
    const refresh = () => setToday(localDateKey(new Date()));
    const timer = setInterval(refresh, 30000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [ready]);
  useEffect(() => {
    if (!ready || !settings.notifications) return;
    let cancelled = false;
    const reconcile = async () => {
      try {
        const granted = await hasReminderPermission();
        if (cancelled) return;
        if (!granted) {
          await setDiaryReminder(false);
          await update((value) => ({ ...value, settings: { ...value.settings, notifications: false } }));
        } else await setDiaryReminder(true);
      } catch (cause) { if (!cancelled) reportError(cause); }
    };
    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void reconcile(); });
    return () => { cancelled = true; subscription.remove(); };
  }, [ready, settings.notifications, update]);
  const addPhotos = async () => {
    if (photoLock.current || saveLock.current || draft.photos.length >= MAX_PHOTOS) return;
    photoLock.current = true; setPhotoBusy(true);
    try {
      const photos = await pickPhotos(MAX_PHOTOS - draft.photos.length);
      if (photos.length) await update((value) => ({ ...value, draft: { ...value.draft, photos: [...value.draft.photos, ...photos].slice(0, MAX_PHOTOS) } }));
    } catch (cause) { reportError(cause); }
    finally { photoLock.current = false; setPhotoBusy(false); }
  };
  const buyItem = async (id) => {
    if (saveLock.current) return;
    if (id === 'prism') {
      showMessage('프리즘', '연속 출석 기능이 아직 연결되지 않아 이 상품은 구매할 수 없어요.');
      return;
    }
    saveLock.current = true; setShopBusy(true); setShopMessage('');
    try {
      await commit((state) => purchaseItem(state, id));
      setShopMessage(id === 'comet' ? '혜성이 나의 우주에 찾아왔어요.' : '새로운 배경을 나의 우주에 적용했어요.');
    } catch (cause) { reportError(cause); }
    finally { saveLock.current = false; setShopBusy(false); }
  };

  // 새 그룹 추가 모달 & 3D 그룹 상세 보기 상태
  const [createGroupModalVisible, setCreateGroupModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [activeGroup3D, setActiveGroup3D] = useState(null); // 카드를 눌렀을 때 3D로 크게 볼 그룹

  // 👆 한 손가락 위치 & 두 손가락 사이 거리를 기억할 변수
  const lastTouch = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(null);

  const getDistance = (touches) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      lastTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
      lastPinchDist.current = null;
    } else if (touches.length >= 2) {
      lastPinchDist.current = getDistance(touches);
    }
  };

  const handleTouchMove = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      if (lastPinchDist.current !== null) {
        lastPinchDist.current = null;
        lastTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
        return;
      }
      const deltaX = touches[0].pageX - lastTouch.current.x;
      const deltaY = touches[0].pageY - lastTouch.current.y;
      
      targetRotX += rotationDelta(deltaX, settings.rotationSensitivity);
      targetRotY += rotationDelta(deltaY, settings.rotationSensitivity);
      
      lastTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
    } else if (touches.length >= 2) {
      const currentDist = getDistance(touches);
      if (lastPinchDist.current !== null) {
        const distDelta = currentDist - lastPinchDist.current;
        targetCameraZ = Math.min(Math.max(targetCameraZ - distDelta * 0.015, 1.2), 10);
      }
      lastPinchDist.current = currentDist;
    }
  };

  const handleTouchEnd = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      lastTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
      lastPinchDist.current = null;
    } else if (touches.length === 0) {
      lastPinchDist.current = null;
    }
  };

  const selectAudience = (groupId) => {
    if (saveLock.current) return;
    void update((state) => selectDiaryAudience(state, groupId)).catch(reportError);
  };
  const handleSelectPrivate = () => selectAudience(null);
  const handleToggleGroupSelect = (groupId) => selectAudience(groupId);

  const handleAddDiaryStar = async () => {
    if (saveLock.current || photoLock.current) return;
    saveLock.current = true; setSaving(true);
    try {
      await commit((state) => addDiary(state));
      void audio.playEffect().catch(() => {});
      setCurrentScreen('home');
    } catch (cause) { reportError(cause); }
    finally { saveLock.current = false; setSaving(false); }
  };

  const handleCreateGroup = async () => {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true);
    try {
      await commit((state) => createGroup(state, newGroupName));
      setNewGroupName('');
      setCreateGroupModalVisible(false);
    } catch (cause) { reportError(cause); }
    finally { saveLock.current = false; setSaving(false); }
  };

  if (!ready) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 20 }]}>
      {storageError ? <><Text style={styles.whiteText}>{storageError}</Text>
        <TouchableOpacity onPress={reload}><Text style={styles.whiteText}>다시 불러오기</Text></TouchableOpacity></> : <ActivityIndicator color="#fff" />}
    </View>
  );

  return (
    <View style={styles.container} onTouchStart={audio.unlock}>
      
      {/* ==========================================
          화면 1 (가운데): 우주 홈 화면
      ========================================== */}
      {currentScreen === 'home' && (
        <ImageBackground
          source={require('../../assets/images/night-sky.png')}
          resizeMode="cover"
          style={styles.universeContainer}>
          {settings.theme !== 'original' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: settings.theme === 'blue' ? '#09275cbb' : '#000000dd' }]} />}

          {/* 👇 3D 우주 터치 전용 센서 영역 👇 */}
          <View
            style={{ flex: 1 }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onStartShouldSetResponderCapture={() => true}
            onMoveShouldSetResponderCapture={() => true}
            onResponderGrant={handleTouchStart}
            onResponderMove={handleTouchMove}
            onResponderRelease={handleTouchEnd}
          >
            <View style={{ flex: 1 }} pointerEvents="none">
              <Canvas style={{ flex: 1 }} gl={{ alpha: true }}>
                <UniverseScene stars={myStars} glow comet={data.purchases.includes('comet')} />
              </Canvas>
            </View>
          </View>

          {/* 상단 바 (우주 위에 떠 있음) */}
          <HomeHud
            scale={uiScale}
            starCount={myStars.length}
            coinCount={data.coins}
            checkCount={new Set(diaries.filter((diary) => diary.authorId === LOCAL_MEMBER.id).map((diary) => localDateKey(diary.createdAt))).size}
            onStats={() => setCurrentScreen('shop')}
            onQuest={() => setQuestVisible(true)}
            menuProps={{ settings, purchases: data.purchases, notificationBusy, onSetting: changeSetting, onVolumePreview: audio.previewVolume,
              onToggleNotifications: toggleNotifications, onAction: menuAction }}
          />
        </ImageBackground>
      )}

      {/* ==========================================
          화면 2 (왼쪽): 일기 작성 화면 (left-write 시안 반영)
      ========================================== */}
      {currentScreen === 'diary' && (
        <DiaryWriteScreen
          scale={uiScale}
          diaryText={diaryText}
          onChangeText={setDiaryText}
          dateLabel={new Date(`${today}T12:00:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          authorLabel={LOCAL_MEMBER.name}
          photoCountLabel={`${draft.photos.length}/${MAX_PHOTOS}`}
          photos={draft.photos} photoBusy={photoBusy} saving={saving}
          onAddPhotos={addPhotos}
          onRemovePhoto={(id) => setDraft((value) => ({ ...value, photos: value.photos.filter((photo) => photo.id !== id) }))}
          groups={groups}
          selectedGroupIds={selectedGroupIds}
          onSelectPrivate={handleSelectPrivate}
          onToggleGroup={handleToggleGroupSelect}
          onBack={() => setCurrentScreen('home')}
          onSubmit={handleAddDiaryStar}
        />
      )}

      {/* ==========================================
          화면 3 (오른쪽): 그룹 우주 화면 (right-group 시안 반영)
      ========================================== */}
      {currentScreen === 'group' && (
        <View style={styles.groupScreenWrapper}>
          <GroupSpaceScreen
            scale={uiScale}
            groups={groups}
            diaries={diaries}
            today={today}
            onSelectGroup={setActiveGroup3D}
            onAddGroup={() => setCreateGroupModalVisible(true)}
          />

          <CreateGroupDialog visible={createGroupModalVisible} scale={uiScale} name={newGroupName}
            defaultName={`그룹${groups.length + 1}`} saving={saving} onChangeName={setNewGroupName}
            onClose={() => setCreateGroupModalVisible(false)} onCreate={handleCreateGroup} />

          {/* 팝업 2: 그룹 카드를 눌렀을 때 해당 그룹 우주를 3D로 크게 보기 */}
          <Modal transparent={false} visible={activeGroup3D !== null} animationType="slide" onRequestClose={() => setActiveGroup3D(null)}>
            {activeGroup3D && (
              <View style={styles.container}>
                <View
                  style={{ flex: 1 }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onStartShouldSetResponderCapture={() => true}
                  onMoveShouldSetResponderCapture={() => true}
                  onResponderGrant={handleTouchStart}
                  onResponderMove={handleTouchMove}
                  onResponderRelease={handleTouchEnd}
                >
                  <View style={{ flex: 1 }} pointerEvents="none">
                    <Canvas style={{ flex: 1 }}>
                      <UniverseScene
                        stars={
                          groups.find((g) => g.id === activeGroup3D.id)?.stars || []
                        }
                      />
                    </Canvas>
                  </View>
                </View>

                <View style={{ position: 'absolute', top: headerTop, left: contentLeft + 20 * uiScale,
                  width: contentWidth - 40 * uiScale, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 * uiScale }}>
                  <SpaceButton scale={uiScale} label="‹ 목록" onPress={() => setActiveGroup3D(null)} />
                  <View style={{ flex: 1, minWidth: 70 * uiScale }}>
                    <Text numberOfLines={1} style={{ color: '#fff', fontFamily: DesignFonts.bold, fontSize: 16 * uiScale }}>{activeGroup3D.name}</Text>
                    <Text style={{ color: '#aeb7c4', fontFamily: DesignFonts.regular, fontSize: 11 * uiScale, marginTop: 5 * uiScale }}>
                      별 {groups.find((group) => group.id === activeGroup3D.id)?.stars.length || 0}개
                    </Text>
                  </View>
                  <GroupMemberStars scale={uiScale} dark members={getGroupAttendance(groups.find((group) => group.id === activeGroup3D.id) || activeGroup3D, diaries, today)} />
                </View>
              </View>
            )}
          </Modal>
        </View>
      )}

      {/* ==========================================
          팝업: 퀘스트 창
      ========================================== */}
      <Modal transparent={true} visible={questVisible} animationType="fade" onRequestClose={() => setQuestVisible(false)}>
        <QuestPanel scale={uiScale} todayComplete={diaries.some((diary) => diary.authorId === LOCAL_MEMBER.id && localDateKey(diary.createdAt) === today)}
          onWriteDiary={() => { setQuestVisible(false); setCurrentScreen('diary'); }} onClose={() => setQuestVisible(false)} />
      </Modal>

      {/* ==========================================
          부가 화면: 커뮤니티 & 글쓰기 & 상점 (기존 기능 유지)
      ========================================== */}
      {currentScreen === 'community' && (
        <View style={[styles.communityContainer, { paddingTop: headerTop, paddingHorizontal: 15 * uiScale,
          width: contentWidth, alignSelf: 'center', paddingBottom: bottomSpace }]}>
          <View style={styles.communityHeader}>
            <Text style={styles.communityHeaderTitle}>✨ 다른 우주 구경하기</Text>
            <TouchableOpacity style={styles.bragButton} onPress={() => setCurrentScreen('write_post')}>
              <Text style={styles.bragButtonText}>+ 자랑하기</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.communityScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.instaCard}>
              <View style={styles.instaHeader}>
                <View style={styles.profileCircleOuter}>
                  <View style={styles.profileCircleInner} />
                </View>
                <Text style={styles.instaAuthor}>지구용사</Text>
              </View>
              <View style={styles.instaImagePlaceholder}>
                <Text style={styles.instaImageText}>own space capture{"\n"}picture</Text>
              </View>
              <View style={styles.instaActions}>
                <Text style={styles.actionIcon}>🤍 97</Text>
                <Text style={styles.actionIcon}>💬 5</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {currentScreen === 'write_post' && (
        <View style={[styles.writeContainer, { paddingTop: headerTop, width: contentWidth, alignSelf: 'center', paddingBottom: bottomSpace }]}>
          <View style={styles.writeHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('community')}>
              <Text style={styles.writeCancelText}>취소</Text>
            </TouchableOpacity>
            <Text style={styles.writeHeaderTitle}>새 게시물</Text>
            <TouchableOpacity onPress={() => {
              alert('성공적으로 우주에 공유되었습니다!');
              setCurrentScreen('community');
            }}>
              <Text style={styles.writeShareText}>공유</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.writeScroll}>
            <View style={styles.writeImagePlaceholder}>
              <Text style={styles.writeImageText}>+ 캡처한 우주 사진 추가</Text>
            </View>
            <TextInput
              style={styles.writeInput}
              multiline={true}
              placeholder="나의 우주에 대해 자랑해보세요..."
              placeholderTextColor="#555"
            />
          </ScrollView>
        </View>
      )}

      {currentScreen === 'shop' && (
        <ShopScreen scale={uiScale} coins={data.coins} purchases={data.purchases} theme={settings.theme}
          busy={shopBusy} message={shopMessage} onBuy={buyItem} />
      )}

      {/* ==========================================
          공통: 하단 네비게이션
          왼쪽: 일기 작성(diary) / 가운데: 홈(home) / 오른쪽: 그룹 우주(group)
      ========================================== */}
      <JournalDialog mode={dialog} diaries={diaries} onClose={() => setDialog(null)} />
      {storageError && <TouchableOpacity accessibilityRole="alert" onPress={() => { void update((value) => value).catch(reportError); }}
        style={{ position: 'absolute', top: insets.top + 10, left: 15, right: 15, padding: 12, backgroundColor: '#802020', zIndex: 30 }}>
        <Text style={styles.whiteText}>{storageError} (눌러서 다시 저장)</Text>
      </TouchableOpacity>}
      <UniverseBottomNav
        scale={uiScale}
        activeScreen={currentScreen}
        onDiary={() => setCurrentScreen('diary')}
        onHome={() => setCurrentScreen('home')}
        onGroup={() => setCurrentScreen('group')}
      />
      
    </View>
  );
}

// ---------------------------------------------------------
// 🎨 디자인(CSS) 영역
// ---------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DesignPaint.background },
  whiteText: { color: '#fff' },
  grayText: { color: '#a4b0be' },
  
  // 1. 가운데 홈(우주) 화면 스타일
  universeContainer: { flex: 1, position: 'relative' },
  topBar: {
    position: 'absolute', top: 60, left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
  },
  iconButton: { backgroundColor: '#7f8c8d', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  iconButtonText: { color: '#111', fontSize: 18, fontWeight: 'bold' },
  statsPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12 },
  statsText: { fontWeight: 'bold', color: '#111', fontSize: 14 },
  questButton: { backgroundColor: '#7f8c8d', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  questText: { fontWeight: 'bold', color: '#111', fontSize: 14 },

  // 3. 오른쪽 그룹 우주 화면 스타일 (right-group 시안 반영)
  groupScreenWrapper: {
    flex: 1,
    backgroundColor: DesignPaint.background,
  },

  // 공통 하단 네비게이션
  bottomNav: {
    position: 'absolute',
    bottom: 100,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  navPill: {
    width: 38,
    height: 18,
    backgroundColor: '#7f8c8d',
    borderRadius: 10,
  },
  navPillLong: {
    width: 115,
  },
  activePill: {
    backgroundColor: '#dcdde1',
  },

  // 커뮤니티 화면 스타일
  communityContainer: { flex: 1, paddingTop: 60, paddingHorizontal: 15, backgroundColor: '#000' },
  communityHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  communityHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', flexShrink: 1 },
  bragButton: { backgroundColor: '#cfd8dc', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5 },
  bragButtonText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  communityScroll: { flex: 1 },
  instaCard: { backgroundColor: '#000', borderRadius: 15, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  instaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  profileCircleOuter: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  profileCircleInner: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#555' },
  instaAuthor: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  instaImagePlaceholder: { width: '100%', height: 250, backgroundColor: '#57606f', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  instaImageText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  instaActions: { flexDirection: 'row', gap: 20, marginBottom: 15 },
  actionIcon: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  writeContainer: { flex: 1, backgroundColor: '#000', paddingTop: 20 },
  writeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
  writeCancelText: { color: '#fff', fontSize: 16 },
  writeHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  writeShareText: { color: '#3498db', fontSize: 16, fontWeight: 'bold' },
  writeScroll: { flex: 1 },
  writeImagePlaceholder: { width: '100%', height: 350, backgroundColor: '#1e1e24', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  writeImageText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  writeInput: { color: '#fff', fontSize: 16, paddingHorizontal: 15, height: 150, textAlignVertical: 'top' },


});
