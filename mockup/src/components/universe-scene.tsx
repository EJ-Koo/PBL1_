// [NEW FILE 2026-09-29] front 브랜치 frontend/src/app/index.jsx의 FloatingStar/UniverseScene을
// mockup 구조(TypeScript, expo-router)에 맞게 분리·이식한 파일.
// [MODIFIED] 원본은 화면 전체를 <View onResponderMove>로 감싸서 드래그를 잡는 방식이었는데,
// 이게 웹 브라우저 마우스 드래그를 못 받는 문제가 있어서, react-three-fiber 자체 포인터
// 이벤트(DragPlane, 아래)로 교체함 — 모바일 터치/웹 마우스 둘 다 이 방식으로 통일해서 받음.
// 자세한 이유는 mockup/CHANGES_FRONTEND.md 참고.
import { useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber/native';
import { View } from 'react-native';
import type { Mesh } from 'three';

import type { DiaryEntry } from '@/store/diary-context';

// 손가락으로 민 거리를 기억해서 우주 전체 회전 각도에 반영하는 값
let targetRotX = 0;
let targetRotY = 0;

/** 일기 한 개 = 별 하나. entry.color를 그대로 별 색으로 사용한다. */
function FloatingStar({
  position,
  color,
  size,
  onPress,
}: {
  position: [number, number, number];
  color: string;
  size: number;
  onPress?: () => void;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onPress?.();
  };

  return (
    <mesh position={position} ref={meshRef} onClick={handleClick}>
      <sphereGeometry args={[size, 32, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} roughness={0.2} />
    </mesh>
  );
}

// 일기 개수에 따라 별들이 흩어질 위치를 결정 (임시 배치 로직 — 서버의 stars.x/y/z 연동 전까지 사용)
function starPosition(index: number): [number, number, number] {
  const angle = (index % 8) * (Math.PI / 4);
  const ring = Math.floor(index / 8);
  const radius = 1.5 + ring * 1.2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle * 1.3) * (radius * 0.6);
  const z = -1.5 - ring * 1.2;
  return [x, y, z];
}

/**
 * 화면 전체를 덮는 투명 평면. 별이 없는 빈 공간을 드래그하면 여기서 잡아서
 * 우주 전체 회전에 반영한다. RN의 View/onPointerMove로 감싸는 방식은 웹에서
 * react-three-fiber 캔버스와 조합했을 때 이벤트가 올라오지 않는 문제가 있어서,
 * r3f가 별 클릭(onClick)에 쓰는 것과 같은 자체 포인터 이벤트 시스템으로 통일함.
 */
function DragPlane() {
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });

  return (
    <mesh
      position={[0, 0, -20]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        dragging.current = true;
        lastPoint.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return;
        const deltaX = e.nativeEvent.pageX - lastPoint.current.x;
        const deltaY = e.nativeEvent.pageY - lastPoint.current.y;
        targetRotX += deltaX * 0.01;
        targetRotY += deltaY * 0.01;
        lastPoint.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerOut={() => {
        dragging.current = false;
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

export function UniverseScene({
  entries,
  onStarPress,
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
}) {
  const groupRef = useRef<import('three').Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += (targetRotX - groupRef.current.rotation.y) * 0.1;
      groupRef.current.rotation.x += (targetRotY - groupRef.current.rotation.x) * 0.1;
    }
  });

  return (
    <>
      <DragPlane />
      <group ref={groupRef}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />

        {entries.map((entry, index) => (
          <FloatingStar
            key={entry.id}
            position={starPosition(index)}
            color={entry.color}
            size={0.35}
            onPress={() => onStarPress(entry.id)}
          />
        ))}
      </group>
    </>
  );
}

/** 3D 우주 화면. 드래그 회전은 UniverseScene 안의 DragPlane이 처리한다. */
export function UniverseCanvas({
  entries,
  onStarPress,
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Canvas style={{ flex: 1 }}>
        <UniverseScene entries={entries} onStarPress={onStarPress} />
      </Canvas>
    </View>
  );
}
