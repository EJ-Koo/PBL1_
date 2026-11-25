import { useEffect } from 'react';
import { Asset } from 'expo-asset';

import { UFO_FRAMES } from '@/lib/ufo-art';
import { startUfoCursor } from '@/lib/ufo-cursor';
import { useShop } from '@/store/shop-context';

export function EquippedCursor() {
  const { items } = useShop();
  const enabled = items.some(item => item.slot === 'cursor' && item.quantity > 0
    && item.equipped && item.effect.type === 'cursor' && item.effect.style === 'ufo_mint');

  useEffect(() => {
    if (!enabled) return;
    return startUfoCursor({
      idle: { ...UFO_FRAMES.idle, uri: Asset.fromModule(UFO_FRAMES.idle.source).uri },
      swim: { ...UFO_FRAMES.swim, uri: Asset.fromModule(UFO_FRAMES.swim.source).uri },
      beam: { ...UFO_FRAMES.beam, uri: Asset.fromModule(UFO_FRAMES.beam.source).uri },
    });
  }, [enabled]);

  return null;
}
