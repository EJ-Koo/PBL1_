/* eslint-disable react-hooks/immutability -- Expo Audio 플레이어의 loop·volume 은 문서에 나온 변경 가능한 속성이다. */
// [ADDED 2026-11-10] 상점에서 장착한 배경음악을 재생한다.
// 음악 아이템의 effect 값으로 소리를 정한다 (관리자 화면에서 입력):
//   {"type":"music","url":"https://.../song.mp3"}   인터넷 주소의 음원 (예: Supabase Storage 공개 주소)
//   {"type":"music","track":"space"}                 앱에 들어 있는 음원 (assets/audio 의 space, night)
//   "volume": 0~1 을 넣으면 그 크기로, 없으면 0.6
// 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 막는다 → 첫 터치 때 다시 재생을 시도한다.
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useShop } from '@/store/shop-context';

const TRACKS: Record<string, number> = {
  space: require('../../assets/audio/space.wav'),
  night: require('../../assets/audio/night.wav'),
};

// 웹 배포 파일을 만들 때(서버에서 미리 그릴 때)는 오디오가 없어 오류가 난다 → 브라우저·앱에서만 플레이어를 만든다.
// (화면에는 아무것도 그리지 않으므로 서버/브라우저 결과가 같아 hydration 문제도 없다)
export function ShopMusic() {
  if (Platform.OS === 'web' && typeof window === 'undefined') return null;
  return <ShopMusicPlayer />;
}

function ShopMusicPlayer() {
  const { activeEffects } = useShop();
  const music = activeEffects.find((e) => e.type === 'music');
  const url = typeof music?.url === 'string' && music.url ? music.url : null;
  const track = typeof music?.track === 'string' ? music.track : null;
  const volume = typeof music?.volume === 'number' ? Math.min(1, Math.max(0, music.volume)) : 0.6;

  // 같은 음악이면 같은 source 객체를 넘겨야 플레이어가 처음부터 다시 시작하지 않는다.
  const source = useMemo(() => (url ? { uri: url } : track && TRACKS[track] ? TRACKS[track] : null), [url, track]);
  const player = useAudioPlayer(source);
  const active = useRef(AppState.currentState === 'active');

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  }, []);

  useEffect(() => {
    const tryPlay = () => {
      if (!source || !active.current || !player.isLoaded) return;
      player.loop = true;
      player.volume = volume;
      try {
        player.play();
      } catch {
        // 자동 재생이 막히면 아래 첫 터치 때 다시 시도
      }
    };

    if (!source) {
      player.pause();
      return;
    }
    tryPlay();
    // 음원을 다 불러오기 전에 tryPlay 가 먼저 불릴 수 있다 → 불러오기가 끝나면(상태 변경) 다시 시도
    const loadSub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.isLoaded && !s.playing) tryPlay();
    });

    const sub = AppState.addEventListener('change', (state) => {
      active.current = state === 'active';
      if (active.current) tryPlay();
      else player.pause();
    });

    let removeUnlock = () => {};
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const unlock = () => {
        tryPlay();
        removeUnlock();
      };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
      removeUnlock = () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
    }
    return () => {
      sub.remove();
      loadSub.remove();
      removeUnlock();
    };
  }, [player, source, volume]);

  return null;
}
