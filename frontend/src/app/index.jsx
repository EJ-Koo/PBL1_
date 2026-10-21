// @ts-nocheck
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';

// ---------------------------------------------------------
// 🚀 [마법의 공책] 손가락으로 화면을 민 거리와 확대 정도를 기억해두는 곳이에요!
// ---------------------------------------------------------
let targetRotX = 0;
let targetRotY = 0;
let targetCameraZ = 5; // 기본 카메라 거리 (숫자가 작아질수록 확대, 커질수록 축소)

// 🌟 빛나는 구슬(별) 컴포넌트
function FloatingStar({ position, color, size }) {
  const meshRef = useRef(null);
  
  // 별이 제자리에서 아주 천천히 반짝거리게 두기
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <mesh position={position} ref={meshRef}>
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} roughness={0.2} />
    </mesh>
  );
}

// 🌌 우주 공간 전체 컴포넌트 (개인 우주 & 모임 우주 공용)
function UniverseScene({ stars }) {
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
      
      {stars.map((star, index) => (
        <FloatingStar
          key={index}
          position={star.position}
          color={star.color}
          size={star.size}
        />
      ))}
    </group>
  );
}

// 🌌 배경에 깔리는 작은 은하수 먼지 별들 (시안 느낌 재현용)
const BG_DOTS = Array.from({ length: 35 }).map((_, i) => ({
  id: i,
  top: `${(i * 29) % 100}%`,
  left: `${(i * 47) % 100}%`,
  size: (i % 3) + 1,
  opacity: ((i % 5) + 2) * 0.12,
}));

// 📱 메인 앱 화면
export default function App() {
  // 화면 상태: 'diary'(왼쪽 일기작성), 'home'(가운데 홈), 'group'(오른쪽 그룹우주), 'shop'(상점), 'community'(커뮤니티)
  const [currentScreen, setCurrentScreen] = useState('home');
  const [questVisible, setQuestVisible] = useState(false);

  // 🌟 메인 우주(나의 우주)에 떠 있는 별 목록 상태
  const [myStars, setMyStars] = useState([
    { position: [-0.8, 0.8, -2], color: '#ff5252', size: 0.32, previewX: '32%', previewY: '38%' },
    { position: [1.2, 0.4, -1], color: '#536dfe', size: 0.35, previewX: '66%', previewY: '43%' },
    { position: [1.4, -0.5, -1.5], color: '#536dfe', size: 0.32, previewX: '70%', previewY: '52%' },
    { position: [-0.8, -1.2, -1], color: '#ffd740', size: 0.32, previewX: '30%', previewY: '57%' },
    { position: [-0.1, -0.1, -3], color: '#ffffff', size: 0.42, previewX: '43%', previewY: '49%' },
  ]);

  // 📝 일기 입력창 텍스트 & 공개 범위(그룹 선택) 상태
  const [diaryText, setDiaryText] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]); // 비어있으면 '비공개(나만 보기)'

  // 🪐 오른쪽 화면(우리의 우주 - 그룹 목록) 상태
  const [groups, setGroups] = useState([
    {
      id: 'group-1',
      name: '그룹1',
      stars: [
        { position: [-0.3, 0.8, -2], color: '#ffffff', size: 0.38, previewX: '42%', previewY: '22%' },
        { position: [1.2, 0.3, -1.5], color: '#536dfe', size: 0.38, previewX: '78%', previewY: '38%' },
        { position: [-0.9, -0.6, -1.5], color: '#ffd740', size: 0.38, previewX: '28%', previewY: '68%' },
      ],
    },
    {
      id: 'group-2',
      name: '그룹2',
      stars: [
        { position: [-0.8, 0.9, -2], color: '#ff5252', size: 0.36, previewX: '31%', previewY: '15%' },
        { position: [1.1, 0.3, -1.5], color: '#536dfe', size: 0.36, previewX: '69%', previewY: '42%' },
        { position: [-0.2, -0.5, -2.5], color: '#ffffff', size: 0.4, previewX: '42%', previewY: '68%' },
        { position: [1.3, -0.9, -1.5], color: '#536dfe', size: 0.34, previewX: '74%', previewY: '82%' },
      ],
    },
  ]);

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
      
      targetRotX += deltaX * 0.01; 
      targetRotY += deltaY * 0.01; 
      
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

  // 🔒 일기 작성 시 공개 범위(비공개 / 그룹) 토글 함수
  const handleSelectPrivate = () => {
    setSelectedGroupIds([]); // 비공개를 누르면 모든 그룹 체크 해제
  };

  const handleToggleGroupSelect = (groupId) => {
    if (selectedGroupIds.includes(groupId)) {
      setSelectedGroupIds(selectedGroupIds.filter((id) => id !== groupId));
    } else {
      setSelectedGroupIds([...selectedGroupIds, groupId]);
    }
  };

  // 🌟 일기 작성 완료 시 나의 우주 + 체크한 그룹 우주에 새 별을 띄우는 함수
  const handleAddDiaryStar = () => {
    const starColors = ['#ff5252', '#536dfe', '#ffd740', '#ff9ff3', '#1dd1a1', '#ffffff'];
    const randomColor = starColors[Math.floor(Math.random() * starColors.length)];
    const randomPosition = [
      (Math.random() - 0.5) * 3.0,
      (Math.random() - 0.5) * 3.0,
      -1 - Math.random() * 2.5,
    ];
    // 그룹 카드 프리뷰용 2D 위치
    const previewX = `${Math.floor(20 + Math.random() * 60)}%`;
    const previewY = `${Math.floor(20 + Math.random() * 60)}%`;

    const newStar = {
      position: randomPosition,
      color: randomColor,
      size: 0.36,
      previewX,
      previewY,
    };

    // 1) 내 우주에 별 추가
    setMyStars((prev) => [...prev, newStar]);

    // 2) 체크된 그룹이 있다면 해당 그룹들의 우주에도 똑같은 별 추가!
    if (selectedGroupIds.length > 0) {
      setGroups((prevGroups) =>
        prevGroups.map((group) =>
          selectedGroupIds.includes(group.id)
            ? { ...group, stars: [...group.stars, newStar] }
            : group
        )
      );
    }

    // 입력 초기화 및 홈 화면으로 이동
    setDiaryText('');
    setSelectedGroupIds([]);
    setCurrentScreen('home');
  };

  // ➕ 오른쪽 화면에서 새로운 그룹 생성 함수
  const handleCreateGroup = () => {
    const defaultName = `그룹${groups.length + 1}`;
    const finalName = newGroupName.trim() ? newGroupName.trim() : defaultName;

    const newGroup = {
      id: `group-${Date.now()}`,
      name: finalName,
      stars: [], // 처음 생성 시 별은 0개 (일기를 공유하면 추가됨)
    };

    setGroups([...groups, newGroup]);
    setNewGroupName('');
    setCreateGroupModalVisible(false);
  };

  return (
    <View style={styles.container}>
      
      {/* ==========================================
          화면 1 (가운데): 우주 홈 화면
      ========================================== */}
      {currentScreen === 'home' && (
        <View style={styles.universeContainer}>
          {/* 은하수 배경 점들 */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
          </View>

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
              <Canvas style={{ flex: 1 }}>
                <UniverseScene stars={myStars} />
              </Canvas>
            </View>
          </View>

          {/* 상단 바 (우주 위에 떠 있음) */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setCurrentScreen('community')}>
              <Text style={styles.iconButtonText}>☰</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.statsPill} onPress={() => setCurrentScreen('shop')}>
              <Text style={styles.statsText}>★ {myStars.length}     🪙 999     ✔️ 2</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.questButton} onPress={() => setQuestVisible(true)}>
              <Text style={styles.questText}>Quest</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ==========================================
          화면 2 (왼쪽): 일기 작성 화면 (left-write 시안 반영)
      ========================================== */}
      {currentScreen === 'diary' && (
        <View style={styles.diaryScreenWrapper}>
          <View style={styles.diaryOuterCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
              {/* 상단: 나의 우주로 돌아가기 */}
              <TouchableOpacity onPress={() => setCurrentScreen('home')}>
                <Text style={styles.diaryBackText}>{'‹  나의 우주'}</Text>
              </TouchableOpacity>

              {/* 타이틀 & 날짜 */}
              <Text style={styles.diaryMainTitle}>오늘은 어떤 별일이 있었나요?</Text>
              <Text style={styles.diaryDateText}>2026년 9월 17일 목요일</Text>

              <View style={styles.diaryDivider} />

              {/* 본문 입력 영역 */}
              <TextInput
                style={styles.diaryTextInput}
                multiline={true}
                placeholder="글을 입력해주세요."
                placeholderTextColor="#222"
                value={diaryText}
                onChangeText={setDiaryText}
              />

              <View style={styles.diaryDivider} />

              {/* 오늘의 장면 (사진 영역) */}
              <View style={styles.photoHeaderRow}>
                <Text style={styles.photoSectionTitle}>오늘의 장면</Text>
                <Text style={styles.photoCountText}>사진 1 / 5</Text>
              </View>

              <View style={styles.photoBoxesRow}>
                {/* 첫 번째 사진 아이콘 박스 */}
                <View style={styles.photoIconBox}>
                  <View style={styles.photoSunCircle} />
                  <View style={styles.photoMountainLeft} />
                  <View style={styles.photoMountainRight} />
                </View>

                {/* 두 번째 사진 추가(+) 박스 */}
                <TouchableOpacity style={styles.photoAddBox}>
                  <Text style={styles.photoAddPlus}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.diaryDivider} />

              {/* 🔒 공개 범위 및 그룹 선택 알약 버튼들 */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sharePillsRow}
              >
                {/* 비공개 버튼 */}
                <TouchableOpacity
                  style={[
                    styles.sharePill,
                    selectedGroupIds.length === 0 && styles.sharePillSelected,
                  ]}
                  onPress={handleSelectPrivate}
                >
                  <Text style={styles.sharePillText}>🔒 비공개</Text>
                </TouchableOpacity>

                {/* 생성된 그룹 버튼들 (그룹1, 그룹2, ...) */}
                {groups.map((group) => {
                  const isSelected = selectedGroupIds.includes(group.id);
                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={[styles.sharePill, isSelected && styles.sharePillSelected]}
                      onPress={() => handleToggleGroupSelect(group.id)}
                    >
                      <Text style={styles.sharePillText}>{group.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 하단: 오늘의 별 띄우기 버튼 */}
              <TouchableOpacity style={styles.submitStarButton} onPress={handleAddDiaryStar}>
                <Text style={styles.submitStarButtonText}>오늘의 별 띄우기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ==========================================
          화면 3 (오른쪽): 그룹 우주 화면 (right-group 시안 반영)
      ========================================== */}
      {currentScreen === 'group' && (
        <View style={styles.groupScreenWrapper}>
          <Text style={styles.groupHeaderTitle}>우리의 우주</Text>

          <ScrollView
            style={styles.groupListScroll}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {groups.map((group) => {
              // 오른쪽 하단 별 5개 중 연두색으로 칠할 개수 계산 (최대 5개)
              const activeStarCount = Math.min(group.stars.length, 5);
              return (
                <TouchableOpacity
                  key={group.id}
                  activeOpacity={0.85}
                  style={styles.groupCard}
                  onPress={() => setActiveGroup3D(group)}
                >
                  {/* 카드 상단: 그룹 우주 미리보기 창 */}
                  <View style={styles.groupUniversePreview}>
                    {/* 은하수 작은 배경 별들 */}
                    {BG_DOTS.slice(0, 18).map((dot) => (
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

                    {/* 이 그룹에 공유된 빛나는 별들 */}
                    {group.stars.map((star, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.previewGlowingStar,
                          {
                            top: star.previewY || `${30 + ((idx * 25) % 50)}%`,
                            left: star.previewX || `${25 + ((idx * 30) % 55)}%`,
                            backgroundColor: star.color,
                            shadowColor: star.color,
                          },
                        ]}
                      />
                    ))}
                  </View>

                  {/* 카드 하단: 그룹 이름 & 별 진행도 아이콘 */}
                  <View style={styles.groupCardFooter}>
                    <Text style={styles.groupCardName}>{group.name}</Text>
                    <View style={styles.groupStarIconsRow}>
                      {[0, 1, 2, 3, 4].map((starIdx) => {
                        // 오른쪽 끝부터 연두색 별이 채워지도록 표현
                        const isNeon = starIdx >= 5 - activeStarCount;
                        return (
                          <Text
                            key={starIdx}
                            style={[
                              styles.groupFooterStar,
                              isNeon ? styles.neonGreenStar : styles.darkStar,
                            ]}
                          >
                            ★
                          </Text>
                        );
                      })}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* ➕ 새 그룹 추가 동그란 버튼 */}
            <View style={styles.addGroupBtnWrapper}>
              <TouchableOpacity
                style={styles.addGroupCircleBtn}
                onPress={() => setCreateGroupModalVisible(true)}
              >
                <Text style={styles.addGroupPlusText}>+</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* 팝업 1: 새 그룹 추가 모달 */}
          <Modal transparent={true} visible={createGroupModalVisible} animationType="fade">
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setCreateGroupModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.inviteModalCard}>
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
                  <TouchableOpacity
                    style={styles.inviteCancelBtn}
                    onPress={() => setCreateGroupModalVisible(false)}
                  >
                    <Text style={styles.whiteText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inviteConfirmBtn}
                    onPress={handleCreateGroup}
                  >
                    <Text style={styles.inviteConfirmText}>생성하기</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* 팝업 2: 그룹 카드를 눌렀을 때 해당 그룹 우주를 3D로 크게 보기 */}
          <Modal transparent={false} visible={activeGroup3D !== null} animationType="slide">
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

                <View style={styles.topBar}>
                  <TouchableOpacity
                    style={styles.questButton}
                    onPress={() => setActiveGroup3D(null)}
                  >
                    <Text style={styles.questText}>{'< 목록으로'}</Text>
                  </TouchableOpacity>
                  <View style={styles.statsPill}>
                    <Text style={styles.statsText}>
                      {activeGroup3D.name}의 우주 (★{' '}
                      {groups.find((g) => g.id === activeGroup3D.id)?.stars.length || 0})
                    </Text>
                  </View>
                  <View style={{ width: 60 }} />
                </View>
              </View>
            )}
          </Modal>
        </View>
      )}

      {/* ==========================================
          팝업: 퀘스트 창
      ========================================== */}
      <Modal transparent={true} visible={questVisible} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setQuestVisible(false)}>
          <View style={styles.questCard}>
            <Text style={styles.questCardTitle}>Quest</Text>
            <Text style={styles.questSectionTitle}>진행 중</Text>
            <View style={styles.questItem}>
              <Text style={styles.whiteText}>오늘의 별 띄우기</Text>
              <Text style={styles.whiteText}>★ 5</Text>
            </View>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: '80%' }]} /></View>

            <View style={styles.questItem}>
              <Text style={styles.whiteText}>운석 3개 치우기</Text>
              <Text style={styles.whiteText}>★ 3</Text>
            </View>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: '40%' }]} /></View>

            <Text style={styles.questSectionTitle}>진행 완료</Text>
            <View style={styles.questItem}>
              <Text style={styles.grayText}>친구 우주에 편지 보내기</Text>
              <Text style={styles.grayText}>★ 3</Text>
            </View>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: '100%', backgroundColor: '#80e03e' }]} /></View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ==========================================
          부가 화면: 커뮤니티 & 글쓰기 & 상점 (기존 기능 유지)
      ========================================== */}
      {currentScreen === 'community' && (
        <View style={styles.communityContainer}>
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
        <View style={styles.writeContainer}>
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
        <View style={styles.shopContainer}>
          <View style={styles.shopHeader}>
            <Text style={styles.shopTitle}>🛍️ 상점</Text>
            <View style={styles.shopCoinPill}>
              <Text style={styles.shopCoinText}>🪙 999</Text>
            </View>
          </View>

          <ScrollView style={styles.shopScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.shopGrid}>
              <View style={styles.shopItemCard}>
                <Text style={styles.shopItemIcon}>❄️</Text>
                <Text style={styles.shopItemName}>프리즘</Text>
                <Text style={styles.shopItemDesc}>연속 출석 멈춤을 1회 방어할 수 있다.</Text>
                <Text style={styles.shopPriceText}>🪙 30</Text>
              </View>
              <View style={styles.shopItemCard}>
                <Text style={styles.shopItemIcon}>🌌</Text>
                <Text style={styles.shopItemName}>배경 (blue)</Text>
                <Text style={styles.shopItemDesc}>나의 우주 배경을 바꿀 수 있다.</Text>
                <Text style={styles.shopPriceText}>🪙 50</Text>
              </View>
              <View style={styles.shopItemCard}>
                <Text style={styles.shopItemIcon}>☄️</Text>
                <Text style={styles.shopItemName}>혜성</Text>
                <Text style={styles.shopItemDesc}>5초마다 나의 우주에 혜성이 떨어진다.</Text>
                <Text style={styles.shopPriceText}>🪙 30</Text>
              </View>
              <View style={styles.shopItemCard}>
                <Text style={styles.shopItemIcon}>🌃</Text>
                <Text style={styles.shopItemName}>배경 (black)</Text>
                <Text style={styles.shopItemDesc}>나의 우주 배경을 바꿀 수 있다.</Text>
                <Text style={styles.shopPriceText}>🪙 50</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ==========================================
          공통: 하단 네비게이션
          왼쪽: 일기 작성(diary) / 가운데: 홈(home) / 오른쪽: 그룹 우주(group)
      ========================================== */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={[styles.navPill, currentScreen === 'diary' && styles.activePill]} 
          onPress={() => setCurrentScreen('diary')} 
        />
        <TouchableOpacity 
          style={[styles.navPill, styles.navPillLong, currentScreen === 'home' && styles.activePill]} 
          onPress={() => setCurrentScreen('home')} 
        />
        <TouchableOpacity 
          style={[styles.navPill, currentScreen === 'group' && styles.activePill]} 
          onPress={() => setCurrentScreen('group')} 
        />
      </View>
      
    </View>
  );
}

// ---------------------------------------------------------
// 🎨 디자인(CSS) 영역
// ---------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050A' },
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

  // 2. 왼쪽 일기 작성 화면 스타일 (left-write 시안 반영)
  diaryScreenWrapper: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 65,
    paddingBottom: 110,
    paddingHorizontal: 18,
  },
  diaryOuterCard: {
    flex: 1,
    backgroundColor: '#787878',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
  },
  diaryBackText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
  },
  diaryMainTitle: {
    color: '#000',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  diaryDateText: {
    color: '#333',
    fontSize: 13,
    marginBottom: 14,
  },
  diaryDivider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 12,
  },
  diaryTextInput: {
    color: '#000',
    fontSize: 14,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  photoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoSectionTitle: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
  photoCountText: {
    color: '#222',
    fontSize: 12,
  },
  photoBoxesRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  photoIconBox: {
    width: 96,
    height: 96,
    backgroundColor: '#000',
    borderRadius: 14,
    borderWidth: 4,
    borderColor: '#d9d9d9',
    overflow: 'hidden',
    position: 'relative',
  },
  photoSunCircle: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#d9d9d9',
  },
  photoMountainLeft: {
    position: 'absolute',
    bottom: -18,
    left: 4,
    width: 52,
    height: 52,
    backgroundColor: '#d9d9d9',
    transform: [{ rotate: '45deg' }],
  },
  photoMountainRight: {
    position: 'absolute',
    bottom: -12,
    right: -4,
    width: 60,
    height: 60,
    backgroundColor: '#d9d9d9',
    transform: [{ rotate: '45deg' }],
  },
  photoAddBox: {
    width: 96,
    height: 96,
    backgroundColor: '#d9d9d9',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAddPlus: {
    color: '#a0a0a0',
    fontSize: 42,
    fontWeight: '300',
    lineHeight: 46,
  },
  sharePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginBottom: 18,
  },
  sharePill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#9e9e9e',
    borderWidth: 1,
    borderColor: '#444',
  },
  sharePillSelected: {
    backgroundColor: '#d9d9d9',
    borderColor: '#d9d9d9',
  },
  sharePillText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  submitStarButton: {
    backgroundColor: '#bdbdbd',
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 'auto',
  },
  submitStarButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // 3. 오른쪽 그룹 우주 화면 스타일 (right-group 시안 반영)
  groupScreenWrapper: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 75,
    paddingBottom: 100,
    paddingHorizontal: 22,
  },
  groupHeaderTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 22,
  },
  groupListScroll: {
    flex: 1,
  },
  groupCard: {
    backgroundColor: '#9e9e9e',
    borderRadius: 22,
    padding: 12,
    marginBottom: 22,
  },
  groupUniversePreview: {
    width: '100%',
    height: 155,
    backgroundColor: '#08080c',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 10,
  },
  previewGlowingStar: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 10,
  },
  groupCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  groupCardName: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
  groupStarIconsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  groupFooterStar: {
    fontSize: 18,
  },
  neonGreenStar: {
    color: '#76ff03',
  },
  darkStar: {
    color: '#1a1a1a',
  },
  addGroupBtnWrapper: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  addGroupCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#787878',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addGroupPlusText: {
    color: '#ccc',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 34,
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

  // 모달 & 기타 화면 스타일
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  questCard: {
    position: 'absolute', top: 120, right: 20, width: 220,
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderRadius: 20, padding: 20,
  },
  questCardTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  questSectionTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginTop: 15, marginBottom: 10 },
  questItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressBar: { height: 4, backgroundColor: '#444', borderRadius: 2, marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: '#80e03e', borderRadius: 2 },

  inviteModalCard: {
    width: '82%',
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

  // 커뮤니티 & 상점 스타일 유지
  communityContainer: { flex: 1, paddingTop: 60, paddingHorizontal: 15, backgroundColor: '#000' },
  communityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  communityHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bragButton: { backgroundColor: '#cfd8dc', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5 },
  bragButtonText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  communityScroll: { marginBottom: 80 },
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
  writeHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', paddingTop: 60 },
  writeShareText: { color: '#3498db', fontSize: 16, fontWeight: 'bold' },
  writeScroll: { flex: 1 },
  writeImagePlaceholder: { width: '100%', height: 350, backgroundColor: '#1e1e24', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  writeImageText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  writeInput: { color: '#fff', fontSize: 16, paddingHorizontal: 15, height: 150, textAlignVertical: 'top' },

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
