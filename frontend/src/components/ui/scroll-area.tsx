import { useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ScrollView, type ScrollViewHandle } from '@/components/app-scroll-view';
import { offsetFromThumb, scrollbarMetrics } from '@/lib/scrollbar';

/** A native scroll view with an always-visible, draggable scrollbar on either axis. */
export function ScrollArea({ children, horizontal = false, style, contentContainerStyle, label, scrollbarLabel, scrollStep = 64, hideScrollbarWhenNotScrollable = false, testID }: {
  children: ReactNode;
  horizontal?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  label: string;
  scrollbarLabel: string;
  scrollStep?: number;
  hideScrollbarWhenNotScrollable?: boolean;
  testID: string;
}) {
  const scroll = useRef<ScrollViewHandle>(null);
  const track = useRef<View>(null);
  const latestOffset = useRef(0);
  const drag = useRef({ point: 0, thumb: 0, moved: false });
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [trackLength, setTrackLength] = useState(0);
  const [offset, setOffset] = useState(0);
  const metrics = scrollbarMetrics({ viewport, content, track: trackLength, offset });
  const percent = metrics.scrollable ? Math.round(metrics.offset / metrics.maxOffset * 100) : 0;
  const showScrollbar = !hideScrollbarWhenNotScrollable || (viewport > 0 && content - viewport > 1);

  const scrollTo = (next: number) => {
    const position = Math.max(0, Math.min(metrics.maxOffset, next));
    scroll.current?.scrollTo(horizontal ? { x: position, animated: false } : { y: position, animated: false });
    latestOffset.current = position;
    setOffset(position);
  };
  const resize = (nextViewport: number, nextContent: number) => {
    const next = Math.max(0, Math.min(latestOffset.current, nextContent - nextViewport));
    if (next !== latestOffset.current) scrollTo(next);
  };

  return <View style={[styles.container, !horizontal && styles.verticalContainer, style]} testID={testID}>
    <ScrollView ref={scroll} horizontal={horizontal} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
      nestedScrollEnabled directionalLockEnabled bounces={false} keyboardShouldPersistTaps="handled"
      accessibilityLabel={label} testID={`${testID}-content`} scrollEventThrottle={16}
      style={horizontal ? styles.horizontalViewport : styles.verticalViewport} contentContainerStyle={contentContainerStyle}
      onLayout={event => {
        const next = horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height;
        setViewport(next);
        resize(next, content);
      }}
      onContentSizeChange={(width, height) => {
        const next = horizontal ? width : height;
        setContent(next);
        resize(viewport, next);
      }}
      onScroll={event => {
        const position = horizontal ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y;
        latestOffset.current = position;
        setOffset(position);
      }}>
      {children}
    </ScrollView>

    {showScrollbar ? <View accessible focusable={metrics.scrollable} accessibilityRole="adjustable" accessibilityLabel={scrollbarLabel}
      accessibilityState={{ disabled: !metrics.scrollable }} accessibilityValue={{ min: 0, max: 100, now: percent }}
      aria-disabled={!metrics.scrollable} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'increment') scrollTo(metrics.offset + scrollStep);
        else if (event.nativeEvent.actionName === 'decrement') scrollTo(metrics.offset - scrollStep);
      }}
      onStartShouldSetResponder={() => metrics.scrollable}
      onResponderGrant={event => {
        drag.current = { point: horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY, thumb: metrics.thumbOffset, moved: false };
      }}
      onResponderMove={event => {
        const delta = (horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY) - drag.current.point;
        if (Math.abs(delta) > 3) drag.current.moved = true;
        scrollTo(offsetFromThumb(drag.current.thumb + delta, metrics));
      }}
      onResponderRelease={event => {
        if (drag.current.moved) return;
        const point = horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY;
        track.current?.measureInWindow((left, top) => {
          const relative = point - (horizontal ? left : top);
          if (relative < metrics.thumbOffset || relative > metrics.thumbOffset + metrics.thumbSize) {
            scrollTo(offsetFromThumb(relative - metrics.thumbSize / 2, metrics));
          }
        });
      }}
      onResponderTerminationRequest={() => false}
      {...(Platform.OS === 'web' ? { 'aria-orientation': horizontal ? 'horizontal' : 'vertical' } : {})}
      {...{ onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        const arrows = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        if (!metrics.scrollable || ![...arrows, 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === arrows[0] || event.key === 'PageUp' ? -1 : 1;
        const step = event.key.startsWith('Page') ? viewport * 0.8 : scrollStep;
        scrollTo(event.key === 'Home' ? 0 : event.key === 'End' ? metrics.maxOffset : metrics.offset + direction * step);
      } }}
      testID={`${testID}-scrollbar`} style={horizontal ? styles.horizontalBar : styles.verticalBar}>
      <View ref={track} pointerEvents="none" onLayout={event => setTrackLength(horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height)}
        style={[styles.track, horizontal ? styles.horizontalTrack : styles.verticalTrack]}>
        <View testID={`${testID}-thumb`} style={[styles.thumb, !metrics.scrollable && styles.inactiveThumb,
          horizontal ? { left: metrics.thumbOffset, width: metrics.thumbSize, top: 0, bottom: 0 }
            : { top: metrics.thumbOffset, height: metrics.thumbSize, left: 0, right: 0 }]} />
      </View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { minWidth: 0 },
  verticalContainer: { flexDirection: 'row', minHeight: 0, gap: 8 },
  horizontalViewport: { flexGrow: 0, flexShrink: 0, minWidth: 0 },
  verticalViewport: { flex: 1, minWidth: 0, minHeight: 0 },
  horizontalBar: { height: 24, justifyContent: 'center' },
  verticalBar: { width: 14, paddingVertical: 4, alignItems: 'center' },
  track: { borderRadius: 10, backgroundColor: '#5c5c5c', overflow: 'hidden' },
  horizontalTrack: { width: '100%', height: 8 },
  verticalTrack: { width: 8, flex: 1 },
  thumb: { position: 'absolute', borderRadius: 10, backgroundColor: '#d9d9d9' },
  inactiveThumb: { opacity: 0.45 },
});
