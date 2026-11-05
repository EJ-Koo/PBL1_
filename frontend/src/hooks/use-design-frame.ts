// [NEW FILE 2026-11-05] fffju 디자인 화면의 폭과 배율.
// fffju 화면은 393 × 852 기준 디자인을 화면 폭에 맞춰 키운다(scale = 폭 / 393).
// 폰에서는 그대로(fffju 방식), 웹·PC처럼 넓은 화면에서는 폭을 최대 520px로 묶고 가운데 정렬한다
// (기존 검색·일기 화면의 maxWidth: 520과 같은 기준). 이렇게 안 하면 모니터에서 글자·버튼이 4~5배로 커진다.
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesignSize } from '@/constants/ui-design';

export const MAX_FRAME_WIDTH = 520;

export function useDesignFrame() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const available = Math.max(0, width - insets.left - insets.right);
  const frameWidth = Math.min(available, MAX_FRAME_WIDTH);
  return { frameWidth, scale: frameWidth / DesignSize.width };
}
