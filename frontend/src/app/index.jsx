import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';

// ---------------------------------------------------------
// 🚀 [마법의 공책] 손가락으로 화면을 민 거리를 기억해두는 곳이에요!
// ---------------------------------------------------------
let targetRotX = 0;
let targetRotY = 0;

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

// 🌌 우주 공간 전체 컴포넌트
function UniverseScene() {
  const groupRef = useRef(null);
  
  // 🔥 [핵심 기능] 매 프레임마다 손가락이 움직인 만큼 우주 전체를 회전시켜요!
  useFrame(() => {
    if (groupRef.current) {
       // 카메라(우주)가 손가락을 따라 부드럽게 스르륵 돌아가는 수학 공식입니다.
       groupRef.current.rotation.y += (targetRotX - groupRef.current.rotation.y) * 0.1;
       groupRef.current.rotation.x += (targetRotY - groupRef.current.rotation.x) * 0.1;
    }
  });

  return (
    // 이 group 안에 있는 모든 별들이 하나로 묶여서 같이 돌아갑니다.
    <group ref={groupRef}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* 우리가 만든 일기 별들 */}
      <FloatingStar position={[-1.5, 1, -2]} color="#ff6b6b" size={0.3} />
      <FloatingStar position={[1.5, 0.5, -1]} color="#48dbfb" size={0.4} />
      <FloatingStar position={[-0.8, -1.5, -1]} color="#feca57" size={0.3} />
      <FloatingStar position={[0, 0, -4]} color="#ffffff" size={0.5} />
    </group>
  );
}

// 📱 메인 앱 화면
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [questVisible, setQuestVisible] = useState(false);
  
  // 손가락이 처음 닿은 위치를 기억할 변수
  const lastTouch = useRef({ x: 0, y: 0 });

  return (
    <View style={styles.container}>
      
      {/* ==========================================
          화면 1: 우주 홈 화면
      ========================================== */}
      {currentScreen === 'home' && (
        <View 
          style={styles.universeContainer}
          // 👇 여기서부터 투명한 터치 센서 역할입니다! 👇
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            // 손가락이 화면에 딱 닿았을 때의 x, y 좌표 기억하기
            lastTouch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          }}
          onResponderMove={(e) => {
            // 손가락이 화면에서 미끄러진 거리(delta) 계산
            const deltaX = e.nativeEvent.pageX - lastTouch.current.x;
            const deltaY = e.nativeEvent.pageY - lastTouch.current.y;
            
            // 거리에 비례해서 우주가 돌아갈 목표 각도를 바꿔줍니다
            targetRotX += deltaX * 0.01; 
            targetRotY += deltaY * 0.01; 
            
            // 다시 현재 위치 업데이트
            lastTouch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          }}
        >
          {/* 3D 우주 공간 */}
          <Canvas style={{ flex: 1 }}>
            <UniverseScene />
          </Canvas>

          {/* 상단 바 (우주 위에 떠 있음) */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconButton}>
              <Text style={styles.whiteText}>☰</Text>
            </TouchableOpacity>
            
            <View style={styles.statsPill}>
              <Text style={styles.statsText}>★ 99   ⓟ 999   ✔️ 2</Text>
            </View>

            <TouchableOpacity style={styles.questButton} onPress={() => setQuestVisible(true)}>
              <Text style={styles.questText}>Quest</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ==========================================
          화면 2: 일기 작성 화면
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
            />
            <Text style={styles.wordCount}>102자 · 자동 저장됨</Text>
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

          <TouchableOpacity style={styles.submitButton}>
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
          공통: 하단 네비게이션
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
        <TouchableOpacity style={styles.navPill} />
      </View>
      
    </View>
  );
}

// ---------------------------------------------------------
// 🎨 디자인(CSS) 영역 (이전과 동일합니다!)
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  activePill: { backgroundColor: '#dcdde1' } 
});
