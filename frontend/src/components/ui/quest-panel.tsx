import { useState } from 'react';
import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
import { DesignFonts } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { authSession } from '@/lib/auth-session';
import { useLanguage } from '@/lib/language';
import { confirmChoice } from '@/lib/notice';
import type { MeteorQuest } from '@/lib/quest-api';
import { useQuest } from '@/store/quest-context';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { QuestCardFrame, QuestDivider, QuestPanelFrame } from './quest-decoration';
import { SpaceIcon } from './space-ui';

type Props = {
  scale: number; onClose: () => void; onWriteDiary: () => void;
  meteorQuest: MeteorQuest | null; meteorBusy: boolean; meteorError: string | null;
  onRetryMeteors: () => void;
  confirmedQuests: Partial<Record<'diary' | 'meteor', string>>;
  onConfirmQuest: (kind: 'diary' | 'meteor', key: string) => void;
};

export function QuestPanel({ scale: layoutScale, onClose, onWriteDiary, meteorQuest, meteorBusy, meteorError, onRetryMeteors, confirmedQuests, onConfirmQuest }: Props) {
  const { t } = useLanguage();
  const [expandedQuest, setExpandedQuest] = useState<'diary' | 'meteor' | null>(null);
  const { quest, loading, error, refresh, reset } = useQuest();
  const { height, chromeLeft, chromeWidth, headerTop, bottomSpace } = useResponsiveLayout();
  const compact = Platform.OS === 'android';
  const top = headerTop + 80 * layoutScale;
  const width = Math.min(
    compact ? chromeWidth * 0.56 : 352 * layoutScale,
    chromeWidth - 28 * layoutScale,
  );
  const scale = compact ? Math.min(layoutScale, width / 352) : layoutScale;
  const panelHeight = Math.min(
    compact ? height * 0.36 : 540 * layoutScale,
    Math.max(0, height - top - bottomSpace),
  );
  const todayComplete = quest?.completed ?? false;
  const meteorsComplete = meteorQuest?.cleared.length === 3;
  const revision = authSession.getRevision();
  const diaryKey = `${revision}:${quest?.day}:${quest?.cycle}`;
  const meteorKey = `${revision}:${meteorQuest?.day}:${meteorQuest?.cycle}`;
  const diaryConfirmed = todayComplete && confirmedQuests.diary === diaryKey;
  const meteorConfirmed = meteorsComplete && confirmedQuests.meteor === meteorKey;
  const resetQuest = () => confirmChoice(
    t('퀘스트 초기화'),
    t('일기와 코인은 유지돼요. 일기와 운석 퀘스트 진행률을 초기화하고, 완료하면 보상을 다시 받을 수 있어요.'),
    t('초기화'),
    async () => { if (await reset()) onRetryMeteors(); },
  );

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel={t('퀘스트 닫기')} style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={{ position: 'absolute', left: chromeLeft + chromeWidth - width - 17 * layoutScale, top, width, height: panelHeight }}>
        <QuestPanelFrame width={width} height={panelHeight} scale={scale} />
        <View style={{ paddingTop: 22 * scale, paddingHorizontal: 28 * scale }}>
          <View style={[styles.headingRow, { minHeight: 40 * scale }]}>
            <View style={[styles.heading, { gap: 10 * scale }]}>
              <SpaceIcon kind="star" size={29 * scale} color={colors.text} />
              <Text accessibilityRole="header" style={[styles.bold, { fontSize: 30 * scale, lineHeight: 40 * scale }]}>Quest</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('퀘스트 닫기')} onPress={onClose}
              style={({ pressed }) => ({ position: 'absolute', right: -10 * scale, width: Math.max(44, 30 * scale), height: Math.max(44, 36 * scale), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
              <Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" pointerEvents="none" accessible={false}>
                <Path d="M4 4L20 20M20 4L4 20" stroke={colors.text} strokeWidth={2.5} />
              </Svg>
            </Pressable>
          </View>
          <Text style={[styles.muted, { fontSize: 13 * scale, lineHeight: 19 * scale }]}>{t('오늘의 임무')}</Text>
          <QuestDivider scale={scale} header />
        </View>

        <ScrollView style={{ flex: 1, marginTop: 10 * scale, marginBottom: 27 * scale }}
          contentContainerStyle={{ paddingHorizontal: 14 * scale, paddingBottom: 5 * scale }} showsVerticalScrollIndicator={false}>
          {loading && <Text accessibilityLiveRegion="polite" style={[styles.muted, { fontSize: 12 * scale, lineHeight: 20 * scale, marginHorizontal: 14 * scale, marginBottom: 10 * scale }]}>{t('퀘스트 확인 중…')}</Text>}
          {error && <View style={{ gap: 8 * scale, marginHorizontal: 14 * scale, marginBottom: 12 * scale }}>
            <Text accessibilityRole="alert" style={[styles.text, { fontSize: 12 * scale, lineHeight: 19 * scale }]}>{error}</Text>
            <QuestButton scale={scale} label={t('다시 불러오기')} disabled={loading} onPress={() => { void refresh(); }} />
          </View>}

          {quest && (expandedQuest === 'diary' ? <View style={{ paddingHorizontal: 26 * scale, paddingTop: 19 * scale, paddingBottom: 22 * scale }}>
            <QuestCardFrame scale={scale} highlighted />
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: true }}
              accessibilityLabel={t('오늘의 별 띄우기')} onPress={() => setExpandedQuest(null)}
              style={[styles.headingRow, { gap: 8 * scale, alignItems: 'flex-start', minHeight: 44 }]}>
              <Text style={[styles.bold, { flex: 1, fontSize: 21 * scale, lineHeight: 29 * scale }]}>{t('오늘의 별 띄우기')}</Text>
              <QuestRewardBadge scale={scale} reward={quest.reward} />
            </Pressable>
            <Text style={[styles.muted, { fontSize: 15 * scale, lineHeight: 22 * scale, marginTop: 6 * scale }]}>
              {t(quest.after_reset ? '초기화 이후 새 일기 쓰기' : '일기 한 편 남기기')}
            </Text>
            <View style={{ marginTop: 4 * scale, marginBottom: 17 * scale }}>
              <QuestProgress scale={scale} progress={quest.progress} target={quest.target} />
            </View>
            {todayComplete && <View accessibilityLiveRegion="polite" style={[styles.heading, { gap: 5 * scale, marginBottom: 10 * scale }]}>
              <SpaceIcon kind="check" size={16 * scale} color={colors.text} />
              <Text style={[styles.text, { flex: 1, fontSize: 11 * scale, lineHeight: 18 * scale }]}>
                {t('완료 · {reward}코인 지급됨', { reward: quest.reward })}
              </Text>
            </View>}
            <QuestButton scale={scale} label={t(diaryConfirmed ? '확인됨' : todayComplete ? '확인' : '일기 쓰러 가기')}
              disabled={loading || diaryConfirmed} onPress={todayComplete ? () => onConfirmQuest('diary', diaryKey) : onWriteDiary} />
          </View> : <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }}
            onPress={() => setExpandedQuest('diary')}
            style={({ pressed }) => ({
              marginHorizontal: 5 * scale, padding: 16 * scale, gap: 8 * scale, opacity: pressed ? 0.75 : 1,
            })}>
            <QuestCardFrame scale={scale} />
            <Text style={[styles.bold, { fontSize: 17 * scale, lineHeight: 25 * scale }]}>{t('오늘의 별 띄우기')}</Text>
            <QuestProgress scale={scale} progress={quest.progress} target={quest.target} />
            <Text style={[styles.text, { fontSize: 13 * scale, lineHeight: 20 * scale }]}>
              {todayComplete ? t('완료 · {reward}코인 지급됨', { reward: quest.reward })
                : t(quest.after_reset ? '초기화 이후 새 일기 쓰기' : '일기 한 편 남기기')}
            </Text>
          </Pressable>)}

          <View style={{ marginHorizontal: 12 * scale, marginTop: 15 * scale, marginBottom: 8 * scale }}><QuestDivider scale={scale} /></View>
          {expandedQuest === 'meteor' ? <View style={{ marginBottom: 12 * scale, paddingHorizontal: 26 * scale, paddingTop: 19 * scale, paddingBottom: 22 * scale }}>
            <QuestCardFrame scale={scale} highlighted />
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: true }}
              accessibilityLabel={t('운석 3개 치우기')} onPress={() => setExpandedQuest(null)}
              style={[styles.headingRow, { gap: 8 * scale, alignItems: 'flex-start', minHeight: 44 }]}>
              <Text style={[styles.bold, { flex: 1, fontSize: 21 * scale, lineHeight: 29 * scale }]}>{t('운석 3개 치우기')}</Text>
              <QuestRewardBadge scale={scale} reward={3} />
            </Pressable>
            <Text style={[styles.muted, { fontSize: 15 * scale, lineHeight: 22 * scale, marginTop: 6 * scale }]}>
              {t('내 우주에 떠다니는 운석 누르기')}
            </Text>
            {meteorQuest && <View style={{ marginTop: 4 * scale, marginBottom: 17 * scale }}>
              <QuestProgress scale={scale} progress={meteorQuest.cleared.length} target={3} />
            </View>}
            {meteorsComplete && <View accessibilityLiveRegion="polite" style={[styles.heading, { gap: 5 * scale, marginBottom: 10 * scale }]}>
              <SpaceIcon kind="check" size={16 * scale} color={colors.text} />
              <Text style={[styles.text, { flex: 1, fontSize: 11 * scale, lineHeight: 18 * scale }]}>
                {t('완료 · {reward}코인 지급됨', { reward: 3 })}
              </Text>
            </View>}
            {meteorError && <Text accessibilityRole="alert" style={[styles.text, { fontSize: 12 * scale, lineHeight: 19 * scale, marginBottom: 8 * scale }]}>{meteorError}</Text>}
            {meteorError && <QuestButton scale={scale} label={t('다시 불러오기')} disabled={meteorBusy} onPress={onRetryMeteors} />}
            {!meteorError && <QuestButton scale={scale} label={t(meteorConfirmed ? '확인됨' : meteorsComplete ? '확인' : '내 우주로 돌아가기')}
              disabled={meteorConfirmed} onPress={meteorsComplete ? () => onConfirmQuest('meteor', meteorKey) : onClose} />}
          </View> : <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }}
            onPress={() => setExpandedQuest('meteor')}
            style={({ pressed }) => ({
              marginHorizontal: 5 * scale, marginBottom: 12 * scale, padding: 16 * scale,
              gap: 8 * scale, opacity: pressed ? 0.75 : 1,
            })}>
            <QuestCardFrame scale={scale} />
            <Text style={[styles.bold, { fontSize: 17 * scale, lineHeight: 25 * scale }]}>{t('운석 3개 치우기')}</Text>
            {meteorQuest && <QuestProgress scale={scale} progress={meteorQuest.cleared.length} target={3} />}
            <Text style={[styles.text, { fontSize: 13 * scale, lineHeight: 20 * scale }]}>
              {meteorError ?? (meteorsComplete
                ? t('완료 · {reward}코인 지급됨', { reward: 3 })
                : t('내 우주에 떠다니는 운석 누르기'))}
            </Text>
          </Pressable>}
          <Text style={[styles.muted, { marginHorizontal: 14 * scale, marginBottom: 10 * scale, fontSize: 13 * scale, lineHeight: 20 * scale }]}>{t('다음 퀘스트')}</Text>
          <View style={{ gap: 12 * scale, marginHorizontal: 5 * scale }}>
            <UpcomingQuest scale={scale} title={t('친구 별에 좋아요 누르기')} target={2} />
          </View>

          {quest?.reset_allowed && <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading || meteorBusy }} disabled={loading || meteorBusy} onPress={resetQuest}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 12 * scale, opacity: loading || meteorBusy ? 0.4 : pressed ? 0.6 : 1 })}>
            <Text style={[styles.muted, { fontSize: 11 * scale, lineHeight: 18 * scale }]}>{t('개발용 퀘스트 초기화')}</Text>
          </Pressable>}
        </ScrollView>
      </View>
    </View>
  );
}

function QuestRewardBadge({ scale, reward }: { scale: number; reward: number }) {
  const { t } = useLanguage();
  return (
    <View accessibilityLabel={t('보상 {reward}코인', { reward })}
      style={[styles.badge, { gap: 3 * scale, borderRadius: 14 * scale, minHeight: 25 * scale, paddingHorizontal: 8 * scale, marginTop: 6 * scale }]}>
      <Svg width={17 * scale} height={17 * scale} viewBox="0 0 20 20" pointerEvents="none" accessible={false}>
        <Circle cx={10} cy={10} r={9.5} fill={colors.text} />
        <Path d="M10 3L15 10L10 17L5 10Z" fill={colors.badge} />
      </Svg>
      <Text style={[styles.text, { fontSize: 15 * scale, lineHeight: 21 * scale }]}>{reward}</Text>
    </View>
  );
}

function QuestButton({ scale, label, disabled, onPress }: { scale: number; label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, { minHeight: Math.max(44, 46 * scale), borderRadius: 25 * scale, paddingHorizontal: 12 * scale, paddingVertical: 9 * scale, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
    <Text style={{ color: '#17181d', fontFamily: DesignFonts.bold, fontSize: 18 * scale, lineHeight: 26 * scale, textAlign: 'center' }}>{label}</Text>
  </Pressable>;
}

function QuestProgress({ scale, progress, target }: { scale: number; progress: number; target: number }) {
  const ratio = Math.min(1, Math.max(0, progress / target));
  return <View style={[styles.heading, { gap: 15 * scale }]}>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: target, now: progress }}
      style={{ flex: 1, height: 5 * scale, borderRadius: 3 * scale, backgroundColor: colors.track, overflow: 'hidden' }}>
      <View style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3 * scale, backgroundColor: colors.text }} />
    </View>
    <Text style={[styles.muted, { fontSize: 15 * scale, lineHeight: 22 * scale }]}>{progress}/{target}</Text>
  </View>;
}

function UpcomingQuest({ scale, title, target }: { scale: number; title: string; target: number }) {
  const { t } = useLanguage();
  // These quests have no progress API yet. Keep their preview state explicit.
  return <View accessible accessibilityLabel={`${title}, ${t('준비 중')}`} style={{ minHeight: 69 * scale, paddingLeft: 24 * scale, paddingRight: 40 * scale, paddingVertical: 13 * scale }}>
    <QuestCardFrame scale={scale} locked />
    <View style={[styles.headingRow, { gap: 8 * scale }]}>
      <Text style={[styles.bold, { flex: 1, fontSize: 14 * scale, lineHeight: 23 * scale }]}>{title}</Text>
      <View style={[styles.badge, { borderRadius: 14 * scale, minHeight: 24 * scale, paddingHorizontal: 9 * scale }]}>
        <Text style={[styles.text, { fontSize: 11 * scale, lineHeight: 18 * scale }]}>{t('준비 중')}</Text>
      </View>
    </View>
    <View style={[styles.heading, { gap: 15 * scale }]}>
      <View style={{ flex: 1, height: 5 * scale, borderRadius: 3 * scale, backgroundColor: colors.track, opacity: 0.4 }} />
      <Text style={[styles.muted, { fontSize: 14 * scale, lineHeight: 19 * scale }]}>—/{target}</Text>
    </View>
  </View>;
}

const colors = {
  text: '#f4f4f6', muted: '#9d9da4', badge: '#17181e', track: '#97979f',
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0009' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { flexDirection: 'row', alignItems: 'center' },
  text: { color: colors.text, fontFamily: DesignFonts.regular },
  bold: { color: colors.text, fontFamily: DesignFonts.bold },
  muted: { color: colors.muted, fontFamily: DesignFonts.regular },
  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#b6b7c1', backgroundColor: colors.badge },
  action: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#dedee2', borderWidth: 1, borderColor: '#f0f0f3' },
});
