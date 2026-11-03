// 볼륨 조절처럼 가로 막대를 눌러 끌면 값이 바뀌는 슬라이더 (외부 패키지 없이 구현).
// 막대 위 어디를 눌러도 그 위치로 바로 이동하고, 누른 채로 좌우로 끌 수 있다.
import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

const THUMB = 18;

export function ValueSlider({ value, min, max, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const ratio = max > min ? (value - min) / (max - min) : 0;

  const update = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    // 막대 안의 자식(채움·손잡이)은 터치를 받지 않게 해 두어서 locationX가 항상 막대 기준이다.
    const r = Math.min(Math.max(e.nativeEvent.locationX / width, 0), 1);
    onChange(min + r * (max - min));
  };

  return (
    <View
      style={styles.hitArea}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // 메뉴 스크롤이 가로 드래그를 가로채지 않도록 한 번 잡으면 놓지 않는다.
      onResponderTerminationRequest={() => false}
      onResponderGrant={update}
      onResponderMove={update}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: Math.max(0, ratio * width - THUMB / 2) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: { height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#33334A', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#DCDDE1' },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#7F8C8D',
  },
});
