import { CoinIcon } from '@/components/coin-icon';
import { useQuest } from '@/store/quest-context';
import { confirmChoice } from '@/lib/notice';
import { Text } from '@/components/app-text';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SpaceButton, SpaceIcon, SpaceSurface } from './space-ui';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type Props = { scale: number; onClose: () => void; onWriteDiary: () => void };

export function QuestPanel({ scale, onClose, onWriteDiary }: Props) {
  const { quest, loading, error, refresh, reset } = useQuest();
  const todayComplete = quest?.completed ?? false;
  const resetQuest = () => confirmChoice('퀘스트 초기화', '일기와 코인은 유지됩니다. 초기화 후 새 일기를 작성하면 다시 5코인을 받습니다.', '초기화', () => { void reset(); });
  const { height, chromeLeft, chromeWidth, headerTop, bottomSpace } = useResponsiveLayout();
  const top = headerTop + 80 * scale;
  const availableHeight = Math.max(0, height - top - bottomSpace);
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="퀘스트 닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ position: 'absolute', left: chromeLeft + chromeWidth - 237 * scale, top,
        width: 220 * scale, height: Math.min(540 * scale, availableHeight) }}>
        <SpaceSurface style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 18 * scale }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 * scale }}>
              <View style={{ flexDirection: 'row', gap: 8 * scale, alignItems: 'center' }}>
                <SpaceIcon kind="star" size={17 * scale} /><Text style={[styles.bold, { fontSize: 18 * scale }]}>Quest</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="퀘스트 닫기" hitSlop={10} onPress={onClose}>
                <Text style={[styles.text, { fontSize: 23 * scale }]}>×</Text>
              </Pressable>
            </View>
            <Text style={[styles.muted, { fontSize: 11 * scale, marginBottom: 24 * scale }]}>오늘의 작은 임무</Text>
            {loading && <Text accessibilityLiveRegion="polite" style={[styles.muted, { fontSize: 12 * scale, marginBottom: 12 * scale }]}>퀘스트 확인 중…</Text>}
            {error && <View style={{ gap: 8 * scale, marginBottom: 12 * scale }}><Text accessibilityRole="alert" style={{ color: '#ffd0cb', fontSize: 12 * scale }}>{error}</Text><SpaceButton scale={scale} label="다시 불러오기" disabled={loading} onPress={() => { void refresh(); }} /></View>}
            {quest && <>
            <Text style={[styles.bold, { fontSize: 16 * scale, lineHeight: 24 * scale, opacity: todayComplete ? 0.55 : 1, textDecorationLine: todayComplete ? 'line-through' : 'none' }]}>오늘의 별 띄우기</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 * scale }}>
              <Text style={[styles.muted, { fontSize: 11 * scale }]}>{quest.after_reset ? '초기화 이후 새 일기 쓰기' : '일기 한 편 남기기'}</Text>
              <Text style={[styles.text, { fontSize: 11 * scale }]}>{todayComplete ? '1' : '0'}/1</Text>
            </View>
            <View style={{ height: 3 * scale, backgroundColor: '#ffffff35', marginTop: 12 * scale, marginBottom: 16 * scale }}>
              {todayComplete && <View style={{ flex: 1, backgroundColor: DesignPaint.questProgress }} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 * scale, marginBottom: 12 * scale }}><CoinIcon size={23 * scale} /><Text style={[styles.text, { fontSize: 12 * scale }]}>보상 {quest.reward}코인</Text></View>
            {todayComplete ? (
              <View accessibilityRole="text" accessibilityLabel="오늘의 퀘스트 완료"
                style={{ borderColor: DesignPaint.questProgress, borderWidth: 1, borderRadius: 20 * scale,
                  backgroundColor: '#9DFD0210', minHeight: 38 * scale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 * scale }}>
                <SpaceIcon kind="check" size={17 * scale} color={DesignPaint.questProgress} />
                <Text style={{ color: DesignPaint.questProgress, fontFamily: DesignFonts.bold, fontSize: 12 * scale }}>완료 · 5코인 지급됨</Text>
              </View>
            ) : <Text style={[styles.muted, { fontSize: 12 * scale, lineHeight: 20 * scale }]}>오늘의 이야기를 남겨보세요.</Text>}
            <SpaceButton scale={scale} label={todayComplete ? '확인' : '일기 쓰러 가기'} onPress={todayComplete ? onClose : onWriteDiary}
              primary={!todayComplete} disabled={loading} style={{ marginTop: 16 * scale }} />
            {quest.reset_allowed && <SpaceButton scale={scale} label="개발용 퀘스트 초기화" disabled={loading} onPress={resetQuest} style={{ marginTop: 10 * scale }} />}
            {!quest.reset_allowed && <Text style={[styles.muted, { fontSize: 10 * scale, lineHeight: 16 * scale, marginTop: 10 * scale }]}>반복 테스트: 관리자 설정에서 ‘상점·퀘스트 개발용 초기화 허용’을 켜면 초기화 버튼이 표시됩니다.</Text>}
            <Text style={[styles.muted, { fontSize: 10 * scale, lineHeight: 16 * scale, marginTop: 12 * scale }]}>한국 시간 기준 매일 자정에 새 퀘스트로 바뀝니다.</Text>
            </>}
            <View style={{ height: 1, backgroundColor: '#ffffff30', marginVertical: 20 * scale }} />
            <Text style={[styles.muted, { fontSize: 11 * scale, marginBottom: 7 * scale }]}>다음 퀘스트</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 * scale }}>
              <Text style={[styles.text, { fontSize: 12 * scale }]}>운석 3개 치우기</Text>
              <Text style={[styles.muted, { fontSize: 11 * scale }]}>준비 중</Text>
            </View>
          </ScrollView>
        </SpaceSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0005' },
  text: { color: '#fff', fontFamily: DesignFonts.regular },
  bold: { color: '#fff', fontFamily: DesignFonts.bold },
  muted: { color: '#aeb7c4', fontFamily: DesignFonts.regular },
});
