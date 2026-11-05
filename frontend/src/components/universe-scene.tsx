// [NEW FILE 2026-09-29] front 브랜치 frontend/src/app/index.jsx의 FloatingStar/UniverseScene을
// mockup 구조(TypeScript, expo-router)에 맞게 분리·이식한 파일.
// [MODIFIED] 원본은 화면 전체를 <View onResponderMove>로 감싸서 드래그를 잡는 방식이었는데,
// 이게 웹 브라우저 마우스 드래그를 못 받는 문제가 있어서, react-three-fiber 자체 포인터
// 이벤트(DragPlane, 아래)로 교체함 — 모바일 터치/웹 마우스 둘 다 이 방식으로 통일해서 받음.
// 자세한 이유는 mockup/CHANGES_FRONTEND.md 참고.
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber/native';
import { Platform, View } from 'react-native';
import { Color, type Group } from 'three';

import { getRotateSensitivity, loadSettings } from '@/lib/settings';
import type { DiaryEntry } from '@/store/diary-context';

// [MODIFIED 2026-11-05] fffju 디자인으로 외관 교체: 배경은 화면 뒤의 night-sky 이미지(캔버스는 투명),
// 별은 둥글게 퍼지는 빛(glow)으로 그린다. 조작(드래그 회전·핀치/휠 확대·별 클릭)은 기존 방식 유지.
// 빛 번짐 셰이더는 fffju index.jsx의 STAR_GLOW_VERTEX/FRAGMENT를 그대로 가져옴.
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
  const glowUniforms = useMemo(() => ({ glowColor: { value: new Color(color) } }), [color]);

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onPress?.();
  };

  return (
    <group position={position}>
      {/* 보이는 부분: 항상 화면을 향하는 둥근 빛 */}
      <mesh raycast={() => null}>
        <planeGeometry args={[size * 2, size * 2]} />
        <shaderMaterial
          uniforms={glowUniforms}
          vertexShader={STAR_GLOW_VERTEX}
          fragmentShader={STAR_GLOW_FRAGMENT}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* 클릭 판정용 투명 구 (빛 평면은 회전 방향에 따라 클릭이 빗나갈 수 있어서 따로 둔다) */}
      <mesh onClick={handleClick}>
        <sphereGeometry args={[size * 0.6, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** fffju 상점의 "혜성" 아이템. 5초마다 화면을 가로질러 떨어진다. */
function Comet() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const phase = clock.getElapsedTime() % 5;
    ref.current.visible = phase < 1.2;
    ref.current.position.set(-3 + phase * 5, 3 - phase * 4, -2);
  });
  return (
    <group ref={ref}>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[-i * 0.08, i * 0.065, 0]} raycast={() => null}>
          <sphereGeometry args={[0.045 * (1 - i / 14), 8, 8]} />
          <meshBasicMaterial color="#fff" transparent opacity={1 - i / 12} />
        </mesh>
      ))}
    </group>
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
// 그래서 window에 직접 wheel 리스너를 붙여서 웹 줌을 구현한다.
// [MODIFIED 2026-11-05] 휠 줌이 가끔 안 먹던 문제 대응:
//  1) 리스너를 화면(컴포넌트)마다 붙였다 떼던 방식 → 앱 전체에서 한 번만 붙이고 떼지 않는다.
//     화면 이동(상세·검색 갔다 오기) 중 붙이기/떼기 순서가 꼬여 리스너가 사라지는 경우를 없앤다.
//  2) 브라우저·마우스에 따라 deltaY 단위가 픽셀(0)이 아니라 줄(1)·페이지(2)로 오면
//     값이 3 정도로 작아서 거의 안 움직였다 → 픽셀 기준으로 환산한다.
//  3) 우주(캔버스) 위에서 굴린 휠만 줌으로 쓴다. 메뉴·검색 목록을 스크롤할 때 우주가 같이 줌되지 않게.
const WHEEL_PIXELS_PER_LINE = 16;
const WHEEL_STEP_LIMIT = 300;
let wheelZoomInstalled = false;

function installWheelZoom() {
  if (Platform.OS !== 'web' || wheelZoomInstalled || typeof window === 'undefined') return;
  wheelZoomInstalled = true;
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      // 캔버스 위에는 react-three-fiber가 이벤트용 div를 덧씌우므로, 대상이 캔버스 자체가 아닐 수 있다.
      // 그래서 우주 화면을 감싼 View(data-universe-zoom 표시)가 이벤트 대상의 조상인지로 판단한다.
      if (!(e.target as Element | null)?.closest?.('[data-universe-zoom]')) return;
      const unit =
        e.deltaMode === 1 ? WHEEL_PIXELS_PER_LINE : e.deltaMode === 2 ? window.innerHeight : 1;
      const dy = Math.min(Math.max(e.deltaY * unit, -WHEEL_STEP_LIMIT), WHEEL_STEP_LIMIT);
      // 현재 거리에 비례해 움직인다(휠 한 칸에 약 16%) — 가까이서도 멀리서도 같은 느낌.
      const next = targetCameraZ * Math.exp(dy * 0.0015);
      targetCameraZ = Math.min(Math.max(next, ZOOM_MIN), ZOOM_MAX);
    },
    { passive: true }
  );
}

export function UniverseScene({
  entries,
  onStarPress,
  comet = false,
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
  comet?: boolean;
}) {
  const groupRef = useRef<Group>(null);
  // [MODIFIED 2026-11-03] 행성 상세·일기 작성 화면에 갔다 오면 3D 화면이 새로 만들어지면서
  // 각도가 0(처음 화면)에서 시작해, 기억해 둔 각도까지 저절로 빙글 돌아가던 문제를 막는다.
  // 첫 프레임에서 기억한 각도·거리로 바로 맞추고, 그 다음 프레임부터 부드럽게 따라가게 한다.
  const synced = useRef(false);

  useEffect(() => {
    installWheelZoom();
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

        {comet && <Comet />}

        {entries.map((entry) => (
          <FloatingStar
            key={entry.id}
            position={entry.position}
            color={entry.color}
            size={0.36}
            onPress={() => onStarPress(entry.id)}
          />
        ))}
      </group>
    </>
  );
}

/** 3D 우주 화면. 배경이 비치도록 캔버스는 투명. 드래그 회전은 UniverseScene 안의 DragPlane이 처리한다. */
export function UniverseCanvas({
  entries,
  onStarPress,
  comet = false,
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
  comet?: boolean;
}) {
  return (
    // dataSet은 웹에서 data-universe-zoom 속성이 된다 (휠 줌 대상 판단용, 위 installWheelZoom 참고).
    <View style={{ flex: 1 }} {...({ dataSet: { universeZoom: 'true' } } as object)}>
      <Canvas style={{ flex: 1 }} gl={{ alpha: true }}>
        <UniverseScene entries={entries} onStarPress={onStarPress} comet={comet} />
      </Canvas>
    </View>
  );
}
