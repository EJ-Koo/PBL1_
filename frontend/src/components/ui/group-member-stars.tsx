import { Text } from '@/components/app-text';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, View } from 'react-native';
import { SpaceIcon } from './space-ui';
import { DesignFonts } from '@/constants/ui-design';
import type { MemberStar } from '@/lib/group-attendance';

function MemberLight({ member, scale }: { member: MemberStar; scale: number }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!member.completed || reduced || !active) { pulse.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [member.completed, reduced, active, pulse]);
  return (
    <View accessible accessibilityLabel={`${member.name}, ${member.completed ? '오늘 공유한 일기 있음' : member.known ? '오늘 공유한 일기 없음' : '작성 여부 확인 불가'}`}
      style={{ width: 18 * scale, height: 22 * scale, alignItems: 'center', justifyContent: 'center' }}>
      {member.completed && <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 22 * scale, height: 22 * scale,
        borderRadius: 11 * scale, backgroundColor: member.color, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.35] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) }] }} />}
      <SpaceIcon kind="star" size={14 * scale} color={member.color} />
      {member.completed && <Animated.View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%',
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [2, -2] }) }] }}>
        {[[0, 2], [15, 12], [4, 18]].map(([left, top], i) => <View key={i} style={{ position: 'absolute', left: left * scale, top: top * scale,
          width: (i === 1 ? 3 : 2) * scale, height: (i === 1 ? 3 : 2) * scale, borderRadius: 2 * scale, backgroundColor: member.color }} />)}
      </Animated.View>}
    </View>
  );
}

export function GroupMemberStars({ members, scale, dark = false }: { members: MemberStar[]; scale: number; dark?: boolean }) {
  const complete = members.filter(member => member.completed).length;
  const allKnown = members.length > 0 && members.every(member => member.known);
  return <View style={{ width: 120 * scale }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 2 * scale }}>
      {members.map(member => <MemberLight key={member.id} member={member} scale={scale} />)}
    </View>
    <Text style={{ color: dark ? '#bbc4d0' : '#252b35', fontFamily: DesignFonts.regular, fontSize: 9 * scale, lineHeight: 13 * scale }}>
      {allKnown ? `오늘 ${complete}/${members.length}명` : `멤버 ${members.length}명 · 확인된 작성 ${complete}명`}
    </Text>
  </View>;
}
