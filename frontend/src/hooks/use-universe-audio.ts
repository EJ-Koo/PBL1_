/* eslint-disable react-hooks/immutability -- Expo Audio players are imperative native handles; volume and loop are documented mutable properties. */
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { Settings } from '@/lib/journal';

const tracks = { space: require('../../assets/audio/space.wav'), night: require('../../assets/audio/night.wav') };

export function useUniverseAudio(settings: Settings, ready: boolean) {
  const music = useAudioPlayer(settings.music === 'off' ? null : tracks[settings.music]);
  const effect = useAudioPlayer(require('../../assets/audio/star.wav'));
  const status = useAudioPlayerStatus(music);
  const interacted = useRef(false);
  const active = useRef(AppState.currentState === 'active');

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  }, []);
  const resume = useCallback(() => {
    if (ready && active.current && settings.music !== 'off' && settings.backgroundVolume > 0 && music.isLoaded) {
      music.loop = true;
      music.volume = settings.backgroundVolume / 100;
      music.play();
    }
  }, [music, ready, settings.music, settings.backgroundVolume]);

  useEffect(() => {
    music.volume = settings.backgroundVolume / 100;
    effect.volume = settings.effectVolume / 100;
    if (settings.music === 'off' || settings.backgroundVolume === 0) music.pause();
    else if (interacted.current) resume();
  }, [music, effect, settings, status.isLoaded, resume]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      active.current = state === 'active';
      if (!active.current) { music.pause(); effect.pause(); }
      else if (interacted.current) resume();
    });
    return () => subscription.remove();
  }, [music, effect, resume]);

  // Starting from a user gesture also works with browser autoplay restrictions.
  const unlock = useCallback(() => { interacted.current = true; resume(); }, [resume]);
  const playEffect = useCallback(async (volume = settings.effectVolume) => {
    unlock();
    if (volume === 0 || !effect.isLoaded) return;
    effect.volume = volume / 100;
    await effect.seekTo(0);
    effect.play();
  }, [effect, settings.effectVolume, unlock]);
  const previewVolume = useCallback((kind: 'backgroundVolume' | 'effectVolume', value: number) => {
    unlock();
    if (kind === 'backgroundVolume') {
      music.volume = value / 100;
      if (value > 0 && settings.music !== 'off' && music.isLoaded) music.play();
      else music.pause();
    } else { effect.volume = value / 100; }
  }, [unlock, music, effect, settings.music]);

  return { unlock, playEffect, previewVolume };
}
