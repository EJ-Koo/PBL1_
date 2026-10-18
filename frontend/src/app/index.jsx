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
       // 1) 한 손가락 드래그: 우주 회전
       groupRef.current.rotation.y += (targetRotX - groupRef.current.rotation.y) * 0.1;
       groupRef.current.rotation.x += (targetRotY - groupRef.current.rotation.x) * 0.1;
    }
    // 2) 두 손가락 핀치: 카메라 앞뒤 이동 (확대/축소)
    state.camera.position.z += (targetCameraZ - state.camera.position.z) * 0.1;
  });

  return (
    // 이 group 안에 있는 모든 별들이 하나로 묶여서 같이 돌아갑니다.
    <group ref={groupRef}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* 우리가 만든 일기 별들 */}
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

// 📱 메인 앱 화면
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [questVisible, setQuestVisible] = useState(false);

  // 🌟 메인 우주(나의 우주)에 떠 있는 별 목록 상태
  const [myStars, setMyStars] = useState([
    { position: [-1.5, 1, -2], color: '#ff6b6b', size: 0.3 },
    { position: [1.5, 0.5, -1], color: '#48dbfb', size: 0.4 },
    { position: [-0.8, -1.5, -1], color: '#feca57', size: 0.3 },
    { position: [0, 0, -4], color: '#ffffff', size: 0.5 },
  ]);

  // 📝 일기 입력창 텍스트 상태
  const [diaryText, setDiaryText] = useState('');

  // ✨ 오른쪽 화면(모임 공유 우주)용 상태
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [friendNameInput, setFriendNameInput] = useState('');
  const [groupMembers, setGroupMembers] = useState(['나', '지우용사', '지구용사']);
  const [groupStars, setGroupStars] = useState([
    { position: [-1.5, 1, -2], color: '#ff6b6b', size: 0.3, author: '나' },
    { position: [1.5, 0.5, -1], color: '#48dbfb', size: 0.4, author: '지우용사' },
    { position: [1.8, -0.4, -1.2], color: '#48dbfb', size: 0.35, author: '지우용사' },
    { position: [-0.8, -1.5, -1], color: '#feca57', size: 0.3, author: '지구용사' },
    { position: [0, 0, -4], color: '#ffffff', size: 0.5, author: '나' },
  ]);
  
  // 👆 한 손가락 위치 & 두 손가락 사이 거리를 기억할 변수
  const lastTouch = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(null);

  // 두 손가락 사이의 거리를 계산하는 함수
  const getDistance = (touches) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 터치 시작 시 실행
  const handleTouchStart = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      lastTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
      lastPinchDist.current = null;
    } else if (touches.length >= 2) {
      lastPinchDist.current = getDistance(touches);
    }
  };

  // 손가락 이동 시 실행 (1손가락: 회전 / 2손가락: 확대·축소)
  const handleTouchMove = (e) => {
    const touches = e.nativeEvent.touches;
    
    if (touches.length === 1) {
      // 두 손가락에서 한 손가락을 뗀 직후 화면이 튀는 현상 방지
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
        // 손가락을 벌리면(distDelta > 0) 카메라 거리가 가까워지며 확대 (최소 1.2 ~ 최대 10)
        targetCameraZ = Math.min(Math.max(targetCameraZ - distDelta * 0.015, 1.2), 10);
      }
      lastPinchDist.current = currentDist;
    }
  };

  // 손가락을 뗄 때 실행
  const handleTouchEnd = (e) => {
    const touches = e.nativeEvent.touches;
    if (touches.length === 1) {
      lastTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
      lastPinchDist.current = null;
    } else if (touches.length === 0) {
      lastPinchDist.current = null;
    }
  };

  // 🌟 일기 작성 완료 시 나의 우주에 새 별을 띄우는 함수
  const handleAddDiaryStar = () => {
    const starColors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#1dd1a1', '#a29bfe', '#ffffff'];
    const randomColor = starColors[Math.floor(Math.random() * starColors.length)];
    const randomPosition = [
      (Math.random() - 0.5) * 3.5,
      (Math.random() - 0.5) * 3.5,
      -1 - Math.random() * 2.5,
    ];

    const newStar = {
      position: randomPosition,
      color: randomColor,
      size: 0.35,
    };

    setMyStars([...myStars, newStar]);
    setDiaryText('');
    setCurrentScreen('home');
  };

  // 친구 초대 함수
  const handleInviteFriend = () => {
    if (!friendNameInput.trim()) return;
    setGroupMembers([...groupMembers, friendNameInput.trim()]);
    const randomPos = [
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
      -1 - Math.random() * 2,
    ];
    const colors = ['#ff9ff3', '#54a0ff', '#5f27cd', '#1dd1a1', '#ff6b6b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setGroupStars([
      ...groupStars,
      { position: randomPos, color: randomColor, size: 0.35, author: friendNameInput.trim() },
    ]);
    setFriendNameInput('');
    setInviteModalVisible(false);
  };

  return (
    <View style={styles.container}>
      
      {/* ==========================================
          화면 1: 우주 홈 화면 (가운데 메인 화면)
      ========================================== */}
      {currentScreen === 'home' && (
        <View style={styles.universeContainer}>
          {/* 👇 3D 우주 터치 전용 센서 영역 (1손가락 회전 / 2손가락 확대·축소) 👇 */}
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
            <TouchableOpacity style={styles.iconButton}>
              <Text style={styles.whiteText}>☰</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.statsPill} onPress={() => setCurrentScreen('shop')}>
              <Text style={styles.statsText}>★ {myStars.length}   🪙 999   ✔️ 2</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.questButton} onPress={() => setQuestVisible(true)}>
              <Text style={styles.questText}>Quest</Text>
            </TouchableOpacity>
          </View>

          {/* ➕ 오른쪽 하단: 별(일기) 생성 버튼 */}
          <TouchableOpacity
            style={styles.addStarFab}
            onPress={() => setCurrentScreen('diary')}
          >
            <Text style={styles.addStarFabText}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ==========================================
          화면 2: 일기 작성 화면 (수정하지 않음)
      ========================================== */}
      {currentScreen === 'diary' && (
        <ScrollView style={styles.diaryContainer}>
          <TouchableOpacity onPress={() => setCurrentScreen('home')}>
            <Text style={styles.backText}>{'< 나의 우주'}</Text>
          </TouchableOpacity>

          <Text style={styles.diaryTitle}>오늘은 어떤 별일이 있었나요?</Text>
          <Text style={styles.diaryDate}>2026년 9월 17일 목요일</Text>

          <View style={styles.diaryCard}>
            <Text style={styles.diaryCardTitle}>발표가 끝나고 찾아온 뿌듯함</Text>
            <TextInput 
              style={styles.diaryInput}
              multiline={true}
              placeholder="여기에 일기를 적어보세요..."
              placeholderTextColor="#999"
              value={diaryText}
              onChangeText={setDiaryText}
            />
            <Text style={styles.wordCount}>{diaryText.length}자 · 자동 저장됨</Text>
          </View>

          <View style={styles.photoSection}>
            <Text style={styles.photoTitle}>오늘의 장면 <Text style={styles.photoSubtitle}>사진 1 / 5</Text></Text>
            <View style={styles.photoBoxes}>
              <View style={styles.photoBoxPlaceholder}>
                 <View style={styles.fakeSun} />
                 <View style={styles.fakeMountain1} />
                 <View style={styles.fakeMountain2} />
              </View>
              <TouchableOpacity style={styles.addPhotoBox}>
                <Text style={styles.addPhotoText}>+{"\n"}사진 추가</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleAddDiaryStar}>
            <Text style={styles.submitButtonText}>오늘의 별 띄우기</Text>
          </TouchableOpacity>
        </ScrollView>
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
          화면 3: 커뮤니티 화면 (왼쪽 화면)
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
              
              <View style={styles.commentSection}>
                <View style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>지우용사</Text>
                  <Text style={styles.commentText}>우와 이뻐용</Text>
                </View>
                <View style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>지구용사_567</Text>
                  <Text style={styles.commentText}>멋있어요 잘 보고 갑니다</Text>
                </View>
              </View>
            </View>

            <View style={styles.instaCard}>
              <View style={styles.instaHeader}>
                <View style={styles.profileCircleOuter}>
                  <View style={styles.profileCircleInner} />
                </View>
                <Text style={styles.instaAuthor}>우주용사</Text>
              </View>
              
              <View style={styles.instaImagePlaceholder} />
              
              <View style={styles.instaActions}>
                <Text style={styles.actionIcon}>🤍 67</Text>
                <Text style={styles.actionIcon}>💬 3</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ==========================================
          화면 4: 자랑하기 (새 글 쓰기) 화면
      ========================================== */}
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

      {/* ==========================================
          화면 5: 상점 화면 (수정하지 않음)
      ========================================== */}
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

              <View style={styles.shopItemCard}>
                <View style={styles.comingSoonContainer}>
                  <Text style={styles.comingSoonText}>coming{"\n"}soon{"\n"}...</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ==========================================
          화면 6: 오른쪽 화면 - 친구들과 함께 쓰는 모임 우주
      ========================================== */}
      {currentScreen === 'group' && (
        <View style={styles.groupScreenContainer}>
          <View style={styles.groupOuterCard}>
            <View style={styles.groupHeaderRow}>
              <View>
                <Text style={styles.groupTitleText}>어쩌구모임의 우주</Text>
                <Text style={styles.groupMemberText}>
                  참여 중: {groupMembers.join(', ')} ({groupMembers.length}명)
                </Text>
              </View>
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={() => setInviteModalVisible(true)}
              >
                <Text style={styles.inviteButtonText}>+ 친구 초대</Text>
              </TouchableOpacity>
            </View>

            <View
              style={styles.groupInnerUniverse}
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
                  <UniverseScene stars={groupStars} />
                </Canvas>
              </View>
            </View>
          </View>

          {/* 팝업: 친구 초대 모달 */}
          <Modal transparent={true} visible={inviteModalVisible} animationType="fade">
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setInviteModalVisible(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.inviteModalCard}>
                <Text style={styles.inviteModalTitle}>🪐 같은 우주에 친구 초대하기</Text>
                <Text style={styles.inviteModalDesc}>
                  초대한 친구가 일기를 쓰면 우리 모임의 우주에 함께 별이 떠요!
                </Text>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="초대할 친구 닉네임 입력"
                  placeholderTextColor="#888"
                  value={friendNameInput}
                  onChangeText={setFriendNameInput}
                />
                <View style={styles.inviteModalButtonRow}>
                  <TouchableOpacity
                    style={styles.inviteCancelBtn}
                    onPress={() => setInviteModalVisible(false)}
                  >
                    <Text style={styles.whiteText}>닫기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inviteConfirmBtn}
                    onPress={handleInviteFriend}
                  >
                    <Text style={styles.inviteConfirmText}>초대하기</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </View>
      )}

      {/* ==========================================
          공통: 하단 네비게이션 (버튼 클릭 이동 방식)
          왼쪽: 커뮤니티 / 가운데: 메인(홈) / 오른쪽: 모임 우주
      ========================================== */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={[styles.navPill, (currentScreen === 'community' || currentScreen === 'write_post') && styles.activePill]} 
          onPress={() => setCurrentScreen('community')} 
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
  
  universeContainer: { flex: 1, position: 'relative' },
  topBar: {
    position: 'absolute', top: 60, left: 20, right: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
  },
  iconButton: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  statsPill: { backgroundColor: '#a4b0be', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  statsText: { fontWeight: 'bold', color: '#111' },
  questButton: { backgroundColor: '#a4b0be', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15 },
  questText: { fontWeight: 'bold', color: '#111' },

  // ➕ 오른쪽 하단 별(일기) 생성 플로팅 버튼 스타일
  addStarFab: {
    position: 'absolute',
    bottom: 145,
    right: 25,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dcdde1',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  addStarFabText: {
    color: '#05050A',
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 34,
  },

  diaryContainer: {
    flex: 1, paddingTop: 60, paddingHorizontal: 25,
    backgroundColor: 'rgba(20,20,30,0.8)', 
  },
  backText: { color: '#fff', fontSize: 16, marginBottom: 20 },
  diaryTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
  diaryDate: { color: '#999', fontSize: 14, marginBottom: 25 },
  diaryCard: { backgroundColor: '#1E1E24', borderRadius: 20, padding: 25, minHeight: 280, marginBottom: 30 },
  diaryCardTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  diaryInput: { color: '#fff', fontSize: 16, flex: 1, textAlignVertical: 'top' },
  wordCount: { color: '#888', fontSize: 12, marginTop: 10 },
  photoSection: { marginBottom: 120 }, 
  photoTitle: { color: '#fff', fontSize: 16, marginBottom: 15, fontWeight: 'bold' },
  photoSubtitle: { color: '#888', fontSize: 14, fontWeight: 'normal' },
  photoBoxes: { flexDirection: 'row', gap: 15 },
  addPhotoBox: { width: 110, height: 110, backgroundColor: '#111115', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  addPhotoText: { color: '#fff', textAlign: 'center', fontSize: 14, lineHeight: 22 },
  submitButton: { backgroundColor: '#4b4b5c', padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 120 },
  submitButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  photoBoxPlaceholder: { width: 110, height: 110, backgroundColor: '#95a5a6', borderRadius: 15, overflow: 'hidden', position: 'relative' },
  fakeSun: { position: 'absolute', top: 20, right: 20, width: 20, height: 20, backgroundColor: '#f1c40f', borderRadius: 10 },
  fakeMountain1: { position: 'absolute', bottom: -10, left: -20, width: 100, height: 60, backgroundColor: '#2c3e50', transform: [{ rotate: '45deg' }] },
  fakeMountain2: { position: 'absolute', bottom: -20, right: -10, width: 80, height: 80, backgroundColor: '#34495e', transform: [{ rotate: '45deg' }] },

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

  bottomNav: {
    position: 'absolute', bottom: 100, width: '100%',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15,
  },
  navPill: { width: 45, height: 18, backgroundColor: '#636e72', borderRadius: 10 },
  navPillLong: { width: 90 },
  activePill: { backgroundColor: '#dcdde1' },

  // 🔥 인스타 스타일 커뮤니티 디자인
  communityContainer: {
    flex: 1, paddingTop: 60, paddingHorizontal: 15,
    backgroundColor: '#000',
  },
  communityHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, marginTop: 10,
  },
  communityHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  bragButton: { backgroundColor: '#cfd8dc', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5 },
  bragButtonText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  
  communityScroll: { marginBottom: 80 },
  instaCard: { 
    backgroundColor: '#000', borderRadius: 15, padding: 15, marginBottom: 20,
    borderWidth: 1, borderColor: '#333'
  },
  instaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  profileCircleOuter: { 
    width: 32, height: 32, borderRadius: 16, 
    borderWidth: 2, borderColor: '#fff', 
    justifyContent: 'center', alignItems: 'center', marginRight: 10 
  },
  profileCircleInner: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#555' },
  instaAuthor: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  instaImagePlaceholder: { 
    width: '100%', height: 250, backgroundColor: '#57606f', 
    justifyContent: 'center', alignItems: 'center', marginBottom: 15 
  },
  instaImageText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  
  instaActions: { flexDirection: 'row', gap: 20, marginBottom: 15 },
  actionIcon: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  commentSection: { marginTop: 5 },
  commentRow: { flexDirection: 'row', marginBottom: 8 },
  commentAuthor: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginRight: 10, width: 90 },
  commentText: { color: '#dcdde1', fontSize: 14, flex: 1 },

  // 🔥 글쓰기 화면 디자인
  writeContainer: { flex: 1, backgroundColor: '#000', paddingTop: 20 },
  writeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
  writeCancelText: { color: '#fff', fontSize: 16 },
  writeHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', paddingTop: 60 },
  writeShareText: { color: '#3498db', fontSize: 16, fontWeight: 'bold' },
  writeScroll: { flex: 1 },
  writeImagePlaceholder: { width: '100%', height: 350, backgroundColor: '#1e1e24', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  writeImageText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  writeInput: { color: '#fff', fontSize: 16, paddingHorizontal: 15, height: 150, textAlignVertical: 'top' },

  // 🔥 상점 화면 디자인
  shopContainer: { flex: 1, backgroundColor: '#000', paddingTop: 60, paddingHorizontal: 20 },
  shopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  shopTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  shopCoinPill: { backgroundColor: '#7f8c8d', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  shopCoinText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  
  shopScroll: { flex: 1, marginBottom: 80 },
  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  shopItemCard: { 
    backgroundColor: '#b2bec3', width: '48%', borderRadius: 10, padding: 15, 
    alignItems: 'center', marginBottom: 15 
  },
  shopItemIcon: { fontSize: 50, marginBottom: 15 },
  shopItemName: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: '#000' },
  shopItemDesc: { fontSize: 10, color: '#2d3436', textAlign: 'center', marginBottom: 20, minHeight: 30 },
  shopPriceText: { fontWeight: 'bold', fontSize: 16, color: '#000' },
  
  comingSoonContainer: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', width: '100%', minHeight: 140 },
  comingSoonText: { fontSize: 12, color: '#2d3436', textAlign: 'left' },

  // 🔥 오른쪽 화면: 친구 모임 공유 우주 디자인
  groupScreenContainer: {
    flex: 1,
    backgroundColor: '#05050A',
    paddingTop: 70,
    paddingBottom: 140,
    paddingHorizontal: 18,
  },
  groupOuterCard: {
    flex: 1,
    backgroundColor: '#e6e6ea',
    borderRadius: 28,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  groupTitleText: {
    color: '#111',
    fontSize: 20,
    fontWeight: 'bold',
  },
  groupMemberText: {
    color: '#555',
    fontSize: 12,
    marginTop: 2,
  },
  inviteButton: {
    backgroundColor: '#2d3436',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  groupInnerUniverse: {
    flex: 1,
    backgroundColor: '#05050A',
    borderRadius: 22,
    overflow: 'hidden',
  },
  inviteModalCard: {
    width: '82%',
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#333',
  },
  inviteModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  inviteModalDesc: {
    color: '#a4b0be',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  inviteInput: {
    backgroundColor: '#111115',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  inviteModalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  inviteCancelBtn: {
    backgroundColor: '#444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inviteConfirmBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inviteConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
