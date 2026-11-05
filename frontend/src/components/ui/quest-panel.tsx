import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';

type Props = {
  scale: number;
  onClose: () => void;
  todayComplete: boolean;
};

export function QuestPanel({ scale, onClose, todayComplete }: Props) {
  const insets = useSafeAreaInsets();
  const label = (left: number, top: number, width: number, height: number, size = 16, lineHeight = 22) => ({
    left: left * scale, top: top * scale, width: width * scale, height: height * scale,
    fontSize: size * scale, lineHeight: lineHeight * scale,
  });

  return (
    <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', left: insets.left + 156 * scale,
          top: Math.max(54 * scale, insets.top - 10 * scale) + 80 * scale,
          width: 220 * scale, height: 308 * scale,
        }}>
        <Svg width={220 * scale} height={308 * scale} viewBox="0 0 220 308">
          <Path
            d="M30 1H219V265L187 307H1V40Z"
            fill={DesignPaint.questPanel}
            stroke={DesignPaint.ink}
            strokeWidth={2}
          />
          {[
            { y: 115, progress: todayComplete ? 1 : 0 },
            { y: 163, progress: 0 },
            { y: 265, progress: todayComplete ? 1 : 0 },
          ].map(({ y, progress }) => (
            <G key={y}>
              <Rect x={25} y={y} width={172} height={3} rx={1.5} fill={DesignPaint.questTrack} />
              {progress > 0 && (
                <Rect x={25} y={y} width={172 * progress} height={3} rx={1.5} fill={DesignPaint.questProgress} />
              )}
            </G>
          ))}
          {[90, 138, ...(todayComplete ? [224] : [])].map((y) => (
            <Path
              key={y}
              transform={`translate(160 ${y}) scale(.62)`}
              d="M11 1L14.2 8.1L21.8 8.8L16 14L17.8 21.5L11 17.4L4.2 21.5L6 14L.2 8.8L7.8 8.1Z"
              fill={DesignPaint.ink}
            />
          ))}
        </Svg>

        <Text style={[styles.text, styles.bold, label(95, 12, 70, 24)]}>Quest</Text>
        <Text style={[styles.text, styles.bold, label(25, 52, 150, 30, 20, 28)]}>진행 중</Text>
        <Text style={[styles.text, label(25, 86, 132, 24)]}>오늘의 별 띄우기</Text>
        <Text style={[styles.text, label(179, 86, 18, 24)]}>5</Text>
        <Text style={[styles.text, label(25, 134, 132, 24)]}>운석 3개 치우기</Text>
        <Text style={[styles.text, label(179, 134, 18, 24)]}>3</Text>

        <Text style={[styles.text, styles.bold, label(25, 186, 150, 30, 20, 28)]}>진행 완료</Text>
        <Text style={[styles.text, label(25, 220, 130, 42, 16, 19)]}>{todayComplete ? '오늘의 별 띄우기' : '완료한 퀘스트 없음'}</Text>
        {todayComplete && <Text style={[styles.text, label(179, 220, 18, 24)]}>5</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: DesignPaint.clear },
  text: { position: 'absolute', color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  bold: { fontFamily: DesignFonts.bold, fontWeight: '700' },
});
