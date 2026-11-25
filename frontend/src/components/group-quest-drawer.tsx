import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
import { GroupQuestEdgeFrame, GroupQuestIcon, GroupReadAllIcon } from '@/components/ui/group-universe-decoration';
import { DesignFonts } from '@/constants/ui-design';
import { useFontScale } from '@/hooks/use-font-scale';
import type { GroupQuest } from '@/lib/group-social-api';
import { useLanguage } from '@/lib/language';

type Props = {
  open: boolean;
  scale: number;
  top: number;
  right: number;
  width: number;
  height: number;
  quest: GroupQuest | null;
  error: string | null;
  onToggle: () => void;
  onClose: () => void;
  onRetry: () => void;
};

export function GroupQuestDrawer({ open, scale: s, top, right, width, height, quest, error, onToggle, onClose, onRetry }: Props) {
  const { t } = useLanguage();
  const fontScale = useFontScale();
  const [progress] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(false);
  const tabWidth = Math.max(44, 44 * s);
  const tabHeight = Math.min(height, (62 + 72 * fontScale) * s);
  const labelWidth = Math.max(44 * s, tabHeight - 62 * s);
  const ratio = quest && quest.total > 0 ? Math.min(1, Math.max(0, quest.completed / quest.total)) : 0;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reducedMotion ? 0 : open ? 280 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [open, progress, reducedMotion]);

  return <>
    {open && <Pressable accessibilityRole="button" accessibilityLabel={t('퀘스트 닫기')}
      testID="group-quest-backdrop" onPress={onClose} style={styles.backdrop} />}
    <Animated.View pointerEvents="box-none" style={[styles.drawer, {
      top, right: right - width, width: width + tabWidth, height,
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }],
    }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('그룹 퀘스트')}
        aria-expanded={open} testID="group-quest-tab" onPress={onToggle}
        style={({ pressed }) => [styles.tab, { top: (height - tabHeight) / 2, width: tabWidth, height: tabHeight, opacity: pressed ? 0.7 : 1 }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GroupQuestEdgeFrame width={tabWidth} height={tabHeight} scale={s} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', top: 18 * s, alignSelf: 'center' }}>
          <GroupQuestIcon size={23 * s} />
        </View>
        <Text pointerEvents="none" numberOfLines={1} adjustsFontSizeToFit style={[styles.tabLabel, {
          width: labelWidth, maxWidth: labelWidth, left: (tabWidth - labelWidth) / 2,
          top: (tabHeight + 34 * s - 18 * s * fontScale) / 2, fontSize: 12 * s, lineHeight: 18 * s,
        }]}>QUEST</Text>
      </Pressable>

      <View pointerEvents={open ? 'auto' : 'none'} role="dialog" accessibilityLabel={t('그룹 퀘스트')}
        aria-modal={open} aria-hidden={!open}
        testID="group-quest-panel" style={{ position: 'absolute', left: tabWidth, width, height }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <GroupQuestEdgeFrame width={width} height={height} scale={s} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.content}
          contentContainerStyle={{ paddingHorizontal: 24 * s, paddingTop: 20 * s, paddingBottom: 24 * s }}>
          <View style={[styles.heading, { gap: 12 * s, paddingBottom: 18 * s, marginBottom: 22 * s }]}>
            <GroupQuestIcon size={27 * s} />
            <View style={styles.headingText}>
              <Text accessibilityRole="header" style={[styles.title, { fontSize: 20 * s, lineHeight: 28 * s }]}>QUEST</Text>
              <Text style={[styles.muted, { fontSize: 11 * s, lineHeight: 18 * s }]}>{t('그룹 퀘스트')}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('퀘스트 닫기')} onPress={onClose}
              style={({ pressed }) => [styles.close, { opacity: pressed ? 0.5 : 1 }]}>
              <Svg width={18 * s} height={18 * s} viewBox="0 0 24 24" pointerEvents="none" aria-hidden>
                <Path d="M5 5l14 14 M19 5L5 19" stroke="#ddd" strokeWidth={1.4} />
              </Svg>
            </Pressable>
          </View>

          {quest ? <>
            <Text style={[styles.muted, { fontSize: 11 * s, lineHeight: 18 * s, marginBottom: 12 * s }]}>{quest.day}</Text>
            <View style={[styles.mission, { padding: 18 * s, gap: 14 * s }]}>
              <Text style={[styles.muted, { fontSize: 11 * s, lineHeight: 18 * s }]}>{t('오늘의 임무')}</Text>
              <Text style={[styles.missionTitle, { fontSize: 18 * s, lineHeight: 28 * s }]}>{t(quest.title)}</Text>
              <Text style={[styles.description, { fontSize: 13 * s, lineHeight: 22 * s }]}>{t('오늘 그룹 멤버가 각자 일기를 공유하면 완료돼요.')}</Text>
              <View accessibilityRole="progressbar" accessibilityLabel={t(quest.title)}
                aria-valuemin={0} aria-valuemax={quest.total} aria-valuenow={quest.completed}
                style={[styles.track, { height: 4 * s, marginTop: 6 * s }]}>
                <View style={[styles.progress, { width: `${ratio * 100}%` }]} />
              </View>
              <View style={styles.progressRow}>
                <Text accessibilityLiveRegion="polite" style={[styles.description, { fontSize: 12 * s, lineHeight: 20 * s }]}>
                  {t('{completed}/{total}명', { completed: quest.completed, total: quest.total })}
                </Text>
                {quest.done && <GroupReadAllIcon size={21 * s} />}
              </View>
            </View>
            {quest.done && <Text accessibilityLiveRegion="polite" style={[styles.complete, {
              marginTop: 18 * s, fontSize: 12 * s, lineHeight: 21 * s,
            }]}>{t('오늘의 미션 완료')}</Text>}
          </> : error ? <Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, paddingVertical: 12 * s }}>
            <Text style={[styles.description, { fontSize: 13 * s, lineHeight: 22 * s }]}>{t('퀘스트를 불러오지 못했어요. 다시 시도')}</Text>
          </Pressable> : <View style={{ alignItems: 'center', gap: 16 * s, paddingVertical: 24 * s }}>
            <ActivityIndicator color="#ddd" />
            <Text accessibilityLiveRegion="polite" style={[styles.muted, { fontSize: 12 * s, lineHeight: 20 * s }]}>{t('퀘스트 확인 중…')}</Text>
          </View>}
        </ScrollView>
      </View>
    </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, zIndex: 5, backgroundColor: '#00000038' },
  drawer: { position: 'absolute', zIndex: 6 },
  tab: { position: 'absolute', left: 0 },
  tabLabel: { position: 'absolute', color: '#fff', fontFamily: DesignFonts.bold, textAlign: 'center', transform: [{ rotate: '-90deg' }], includeFontPadding: false },
  content: { flex: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ffffff36' },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: '#f5f5f6', fontFamily: DesignFonts.bold },
  muted: { color: '#a5a5ae', fontFamily: DesignFonts.regular },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  mission: { backgroundColor: '#17171c', borderWidth: 1, borderColor: '#ffffff36' },
  missionTitle: { color: '#f5f5f6', fontFamily: DesignFonts.bold },
  description: { color: '#d6d6dc', fontFamily: DesignFonts.regular },
  track: { backgroundColor: '#ffffff26', overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: '#ddd' },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  complete: { color: '#f5f5f6', fontFamily: DesignFonts.bold, textAlign: 'center' },
});
