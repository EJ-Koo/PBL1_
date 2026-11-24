// [NEW FILE 2026-09-29] front 브랜치 frontend/src/app/index.jsx의 FloatingStar/UniverseScene을
// mockup 구조(TypeScript, expo-router)에 맞게 분리·이식한 파일.
// [MODIFIED] 원본은 화면 전체를 <View onResponderMove>로 감싸서 드래그를 잡는 방식이었는데,
// 이게 웹 브라우저 마우스 드래그를 못 받는 문제가 있어서, react-three-fiber 자체 포인터
// 이벤트(DragPlane, 아래)로 교체함 — 모바일 터치/웹 마우스 둘 다 이 방식으로 통일해서 받음.
// 자세한 이유는 mockup/CHANGES_FRONTEND.md 참고.
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber/native';
import { Platform, View } from 'react-native';
import { DataTexture, LinearFilter, RGBAFormat, type Mesh, type Points } from 'three';

import { getRotateSensitivity, loadSettings } from '@/lib/settings';
import type { DiaryEntry } from '@/store/diary-context';

// pointsMaterial은 텍스처가 없으면 각 점을 네모로 그린다. 중심은 불투명, 가장자리는
// 투명한 작은 원형 텍스처를 입혀서 동그란 별점으로 보이게 한다.
function createDotTexture() {
  const size = 16;
  const center = size / 2;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dist = Math.hypot(x - center + 0.5, y - center + 0.5) / center;
      const alpha = Math.max(0, 1 - dist);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(alpha, 1.5) * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  // DataTexture는 기본 필터가 NearestFilter라 확대하면 각지게 보인다. 부드럽게 보간되도록 바꾼다.
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const DOT_TEXTURE = createDotTexture();

// pointsMaterial의 size는 점 전체에 하나의 값만 적용돼서 크기를 점마다 다르게 못 준다.
// 그래서 점마다 다른 aSize 속성을 읽어 gl_PointSize를 정하는 셰이더로 대체한다.
const STARFIELD_VERTEX_SHADER = `
  attribute float aSize;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const STARFIELD_FRAGMENT_SHADER = `
  uniform sampler2D map;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    if (tex.a < 0.3) discard;
    gl_FragColor = vec4(vec3(1.0), tex.a);
  }
`;
const STARFIELD_UNIFORMS = { map: { value: DOT_TEXTURE } };

/** 별이 흩뿌려진 배경 하늘. 우주 그룹에 같이 속해서 드래그하면 별들과 함께 돈다. */
function Starfield() {
  const pointsRef = useRef<Points>(null);

  const { positions, sizes } = useMemo(() => {
    const count = 1200;
    const pos = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // 카메라를 완전히 감싸는 구 껍질 위에 별을 무작위로 뿌림
      const radius = 18 + Math.random() * 32;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);
      // 별마다 크기를 무작위로. 너무 작으면 안 보이므로 최소 크기를 확보하고 고르게 분포시킴
      siz[i] = 0.22 + Math.random() * 0.5;
    }
    return { positions: pos, sizes: siz };
  }, []);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.006;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={STARFIELD_UNIFORMS}
        vertexShader={STARFIELD_VERTEX_SHADER}
        fragmentShader={STARFIELD_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

// 손가락으로 민 거리를 기억해서 우주 전체 회전 각도에 반영하는 값
let targetRotX = 0;
let targetRotY = 0;
// 두 손가락 핀치(또는 웹 마우스 휠)로 조절하는 카메라 거리. 작을수록 확대, 클수록 축소.
let targetCameraZ = 5;

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

/**
 * 화면 전체를 덮는 투명 평면. 별이 없는 빈 공간을 드래그하면 여기서 잡아서
 * 우주 전체 회전에 반영한다. RN의 View/onPointerMove로 감싸는 방식은 웹에서
 * react-three-fiber 캔버스와 조합했을 때 이벤트가 올라오지 않는 문제가 있어서,
 * r3f가 별 클릭(onClick)에 쓰는 것과 같은 자체 포인터 이벤트 시스템으로 통일함.
 */
const ZOOM_MIN = 1.2;
// [MODIFIED 2026-11-03] 10 → 25: 축소했을 때 우주 전체를 밖에서 내려다볼 수 있게 범위를 넓힘.
const ZOOM_MAX = 25;

function pointerDistance(points: Map<number, { x: number; y: number }>) {
  const [a, b] = Array.from(points.values());
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function DragPlane() {
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  // 동시에 눌려 있는 포인터(손가락/마우스)를 id별로 추적 — 2개가 되면 핀치 줌으로 전환
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);

  return (
    <mesh
      position={[0, 0, -20]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        activePointers.current.set(e.pointerId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
        if (activePointers.current.size >= 2) {
          dragging.current = false;
          lastPinchDist.current = pointerDistance(activePointers.current);
        } else {
          dragging.current = true;
          lastPoint.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!activePointers.current.has(e.pointerId)) return;
        activePointers.current.set(e.pointerId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });

        if (activePointers.current.size >= 2) {
          const currentDist = pointerDistance(activePointers.current);
          if (lastPinchDist.current !== null) {
            const distDelta = currentDist - lastPinchDist.current;
            targetCameraZ = Math.min(Math.max(targetCameraZ - distDelta * 0.015, ZOOM_MIN), ZOOM_MAX);
          }
          lastPinchDist.current = currentDist;
          return;
        }

        if (!dragging.current) return;
        const deltaX = e.nativeEvent.pageX - lastPoint.current.x;
        const deltaY = e.nativeEvent.pageY - lastPoint.current.y;
        // [MODIFIED 2026-11-03] 메뉴의 회전 민감도(0.1~1.5배)를 곱한다.
        const speed = 0.01 * getRotateSensitivity();
        targetRotX += deltaX * speed;
        targetRotY += deltaY * speed;
        lastPoint.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        activePointers.current.delete(e.pointerId);
        lastPinchDist.current = null;
        if (activePointers.current.size === 1) {
          const [remaining] = Array.from(activePointers.current.values());
          lastPoint.current = remaining;
          dragging.current = true;
        } else {
          dragging.current = false;
        }
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        activePointers.current.delete(e.pointerId);
        lastPinchDist.current = null;
        dragging.current = false;
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

// @react-three/fiber/native의 포인터 이벤트는 터치/드래그는 잘 잡지만(DragPlane 참고),
// 웹 마우스 휠(wheel) 이벤트는 전달하지 않는다 — RN용 이벤트 매니저라 DOM wheel을 안 다룸.
// 그래서 캔버스에 기대지 않고 window에 직접 wheel 리스너를 붙여서 웹 줌을 구현한다.
function useWheelZoom() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // [MODIFIED 2026-11-03] 고정 거리(+deltaY*0.0015, 휠 한 칸에 약 0.15)는 체감이 거의 없어서,
    // 현재 거리에 비례해 움직이는 방식으로 바꿈(휠 한 칸에 약 16%). 가까이서도 멀리서도 같은 느낌으로 움직인다.
    const handleWheel = (e: WheelEvent) => {
      const next = targetCameraZ * Math.exp(e.deltaY * 0.0015);
      targetCameraZ = Math.min(Math.max(next, ZOOM_MIN), ZOOM_MAX);
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);
}

export function UniverseScene({
  entries,
  onStarPress,
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
}) {
  const groupRef = useRef<import('three').Group>(null);
  // [MODIFIED 2026-11-03] 행성 상세·일기 작성 화면에 갔다 오면 3D 화면이 새로 만들어지면서
  // 각도가 0(처음 화면)에서 시작해, 기억해 둔 각도까지 저절로 빙글 돌아가던 문제를 막는다.
  // 첫 프레임에서 기억한 각도·거리로 바로 맞추고, 그 다음 프레임부터 부드럽게 따라가게 한다.
  const synced = useRef(false);
  useWheelZoom();

  useEffect(() => {
    loadSettings();
  }, []);

  useFrame((state) => {
    if (!synced.current && groupRef.current) {
      groupRef.current.rotation.y = targetRotX;
      groupRef.current.rotation.x = targetRotY;
      state.camera.position.z = targetCameraZ;
      synced.current = true;
      return;
    }
    if (groupRef.current) {
      groupRef.current.rotation.y += (targetRotX - groupRef.current.rotation.y) * 0.1;
      groupRef.current.rotation.x += (targetRotY - groupRef.current.rotation.x) * 0.1;
    }
    state.camera.position.z += (targetCameraZ - state.camera.position.z) * 0.1;
  });

  return (
    <>
      <DragPlane />
      <group ref={groupRef}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />

        <Starfield />

        {entries.map((entry) => (
          <FloatingStar
            key={entry.id}
            position={entry.position}
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
