import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpaceButton, SpaceIcon, SpaceSurface } from './space-ui';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type Props = { scale: number; onClose: () => void; onWriteDiary: () => void; todayComplete: boolean };

export function QuestPanel({ scale, onClose, onWriteDiary, todayComplete }: Props) {
  const { height, chromeLeft, chromeWidth, headerTop, bottomSpace } = useResponsiveLayout();
  const top = headerTop + 80 * scale;
  const availableHeight = Math.max(0, height - top - bottomSpace);
  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="퀘스트 닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ position: 'absolute', left: chromeLeft + chromeWidth - 237 * scale, top,
        width: 220 * scale, height: Math.min(378 * scale, availableHeight) }}>
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
            <Text style={[styles.bold, { fontSize: 16 * scale, lineHeight: 24 * scale }]}>오늘의 별 띄우기</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 * scale }}>
              <Text style={[styles.muted, { fontSize: 11 * scale }]}>일기 한 편 남기기</Text>
              <Text style={[styles.text, { fontSize: 11 * scale }]}>{todayComplete ? '1' : '0'}/1</Text>
            </View>
            <View style={{ height: 3 * scale, backgroundColor: '#ffffff35', marginTop: 12 * scale, marginBottom: 16 * scale }}>
              {todayComplete && <View style={{ flex: 1, backgroundColor: DesignPaint.questProgress }} />}
            </View>
            {todayComplete ? (
              <View accessibilityRole="text" accessibilityLabel="오늘의 퀘스트 완료, 5코인 지급 완료"
                style={{ borderColor: DesignPaint.questProgress, borderWidth: 1, borderRadius: 20 * scale,
                  backgroundColor: '#9DFD0210', minHeight: 38 * scale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 * scale }}>
                <SpaceIcon kind="check" size={17 * scale} color={DesignPaint.questProgress} />
                <Text style={{ color: DesignPaint.questProgress, fontFamily: DesignFonts.bold, fontSize: 12 * scale }}>완료 · +5 코인 지급됨</Text>
              </View>
            ) : <Text style={[styles.muted, { fontSize: 12 * scale, lineHeight: 20 * scale }]}>완료하면 5코인을 받아요.</Text>}
            <SpaceButton scale={scale} label={todayComplete ? '확인' : '일기 쓰러 가기'} onPress={todayComplete ? onClose : onWriteDiary}
              primary={!todayComplete} style={{ marginTop: 16 * scale }} />
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
