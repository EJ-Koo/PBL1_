import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScrollView, type ScrollViewHandle } from '@/components/app-scroll-view';

export function PhotoScrollStrip({ children, height, gap, scale }: {
  children: ReactNode; height: number; gap: number; scale: number;
}) {
  const scroll = useRef<ScrollViewHandle>(null);
  const track = useRef<View>(null);
  const drag = useRef({ pageX: 0, offset: 0, moved: false });
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const canScroll = maxScroll > 1;
  const offset = Math.max(0, Math.min(maxScroll, scrollX));
  const thumbWidth = Math.min(viewportWidth, Math.max(32, viewportWidth * viewportWidth / Math.max(1, contentWidth)));
  const thumbTravel = viewportWidth - thumbWidth;
  const thumbLeft = canScroll ? offset / maxScroll * thumbTravel : 0;
  const percent = canScroll ? Math.round(offset / maxScroll * 100) : 0;
  const scrollTo = (next: number) => {
    const x = Math.max(0, Math.min(maxScroll, next));
    scroll.current?.scrollTo({ x, animated: false });
    setScrollX(x);
  };
  const resize = (width: number, content: number) => {
    const next = Math.max(0, Math.min(scrollX, content - width));
    if (next !== scrollX) {
      scroll.current?.scrollTo({ x: next, animated: false });
      setScrollX(next);
    }
  };

  return <View style={styles.container}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
      nestedScrollEnabled directionalLockEnabled bounces={false}
      accessibilityLabel="일기 첨부 사진 목록" testID="diary-photo-scroll"
      style={{ height, flexGrow: 0 }} contentContainerStyle={{ gap }}
      keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        setViewportWidth(width);
        resize(width, contentWidth);
      }}
      onContentSizeChange={width => {
        setContentWidth(width);
        resize(viewportWidth, width);
      }}
      onScroll={event => setScrollX(event.nativeEvent.contentOffset.x)}>
      {children}
    </ScrollView>
    <View ref={track} accessible focusable={canScroll} accessibilityRole="adjustable"
      accessibilityLabel="첨부 사진 가로 스크롤" accessibilityState={{ disabled: !canScroll }}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-disabled={!canScroll}
      accessibilityActions={[{ name: 'increment', label: '다음 사진' }, { name: 'decrement', label: '이전 사진' }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'increment') scrollTo(offset + height + gap);
        else if (event.nativeEvent.actionName === 'decrement') scrollTo(offset - height - gap);
      }}
      onStartShouldSetResponder={() => canScroll}
      onResponderGrant={event => {
        drag.current = { pageX: event.nativeEvent.pageX, offset, moved: false };
      }}
      onResponderMove={event => {
        const dx = event.nativeEvent.pageX - drag.current.pageX;
        if (Math.abs(dx) > 3) drag.current.moved = true;
        scrollTo(drag.current.offset + dx / Math.max(1, thumbTravel) * maxScroll);
      }}
      onResponderRelease={event => {
        if (drag.current.moved) return;
        const pageX = event.nativeEvent.pageX;
        track.current?.measureInWindow(left => {
          const x = pageX - left;
          if (x < thumbLeft || x > thumbLeft + thumbWidth) {
            scrollTo((x - thumbWidth / 2) / Math.max(1, thumbTravel) * maxScroll);
          }
        });
      }}
      onResponderTerminationRequest={() => false}
      {...{ onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        if (!canScroll || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        scrollTo(event.key === 'Home' ? 0 : event.key === 'End' ? maxScroll
          : offset + (event.key === 'ArrowRight' ? 1 : -1) * (height + gap));
      } }}
      style={styles.scrollbar} testID="diary-photo-scrollbar">
      <View pointerEvents="none" style={[styles.track, { height: Math.max(5, 7 * scale) }]}>
        <View style={[styles.thumb, { left: thumbLeft, width: thumbWidth }]} testID="diary-photo-scroll-thumb" />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { minWidth: 0 },
  scrollbar: { height: 44, justifyContent: 'center' },
  track: { width: '100%', borderRadius: 20, backgroundColor: '#606060', overflow: 'hidden' },
  thumb: { position: 'absolute', top: 0, bottom: 0, borderRadius: 20, backgroundColor: '#d9d9d9' },
});
