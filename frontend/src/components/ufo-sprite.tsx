import { Image, View } from 'react-native';

import { UFO_CANVAS, UFO_FRAMES, type UfoPose } from '@/lib/ufo-art';

export function UfoSprite({ pose, size = 48 }: { pose: UfoPose; size?: number }) {
  const frame = UFO_FRAMES[pose];
  const scale = size / UFO_CANVAS;
  return (
    <View accessible={false} pointerEvents="none" style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={frame.source}
        accessible={false}
        fadeDuration={0}
        style={{ position: 'absolute', width: frame.width * scale, height: frame.height * scale,
          left: -frame.left * scale, top: -frame.top * scale }}
      />
    </View>
  );
}
