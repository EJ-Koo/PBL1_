import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';

import { HomeHudFrame, HudIcon, QuestFrame } from './design-decoration';
import { HomeMenuPanel } from './home-menu-panel';
import type { ComponentProps } from 'react';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type Props = {
  scale: number;
  starCount: number;
  coinCount: number;
  checkCount: number;
  onStats: () => void;
  onQuest: () => void;
  menuProps: Omit<ComponentProps<typeof HomeMenuPanel>, 'scale' | 'onClose'>;
};

export function HomeHud({ scale, starCount, coinCount, checkCount, onStats, onQuest, menuProps }: Props) {
  const { chromeLeft, chromeWidth, headerTop, wide } = useResponsiveLayout();
  const [menuVisible, setMenuVisible] = useState(false);
  const showLabels = wide && chromeWidth >= 700 * scale;
  const statsWidth = (wide ? 272 : 190) * scale;
  const stats = wide ? [
    { kind: 'star' as const, value: starCount, x: 0, textX: 28, width: 48 },
    { kind: 'coin' as const, value: coinCount, x: 92, textX: 120, width: 66 },
    { kind: 'check' as const, value: checkCount, x: 204, textX: 232, width: 40 },
  ] : [
    { kind: 'star' as const, value: starCount, x: 0, textX: 24, width: 37 },
    { kind: 'coin' as const, value: coinCount, x: 67, textX: 92, width: 39 },
    { kind: 'check' as const, value: checkCount, x: 134, textX: 157, width: 33 },
  ];
  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.container, { left: chromeLeft, top: headerTop, width: chromeWidth, height: 75 * scale }]}>
        <HomeHudFrame scale={scale} width={chromeWidth} wide={wide} />
        <TouchableOpacity
          accessibilityLabel="메뉴"
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => setMenuVisible((visible) => !visible)}
          style={[styles.button, { left: 15 * scale, top: 10 * scale, width: 51 * scale, height: 38 * scale }]}
        />
        {showLabels && <Text pointerEvents="none" style={[styles.brand, { left: 88 * scale, top: 16 * scale,
          fontSize: 20 * scale, lineHeight: 30 * scale, letterSpacing: 2 * scale }]}>STAREX</Text>}
        <TouchableOpacity
          accessibilityLabel="상점"
          hitSlop={{ top: 10, bottom: 10 }}
          onPress={onStats}
          style={[styles.button, { left: (chromeWidth - statsWidth) / 2, top: 16 * scale, width: statsWidth, height: 27 * scale }]}>
          {stats.map(({ kind, value, x, textX, width }) => (
            <View key={kind} style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={[styles.button, { left: x * scale, top: scale }]}>
                <HudIcon kind={kind} scale={scale} />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.count, { left: textX * scale, top: 3 * scale, width: width * scale, fontSize: 16 * scale, lineHeight: 22 * scale }]}>
                {value.toLocaleString()}
              </Text>
            </View>
          ))}
        </TouchableOpacity>
        {showLabels && <TouchableOpacity accessibilityRole="button" accessibilityLabel="상점 열기" onPress={onStats}
          style={[styles.button, { right: 100 * scale, top: 8 * scale, width: 70 * scale, height: 40 * scale,
            alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: DesignPaint.ink, fontFamily: DesignFonts.regular, fontSize: 14 * scale }}>상점</Text>
        </TouchableOpacity>}
        <TouchableOpacity
          accessibilityLabel="퀘스트"
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => {
            setMenuVisible(false);
            onQuest();
          }}
          style={[styles.button, { right: 13 * scale, top: 9 * scale, width: 77 * scale, height: 38 * scale }]}>
          <QuestFrame scale={scale} />
          <Text style={[styles.quest, { top: 8 * scale, width: 77 * scale, fontSize: 16 * scale, lineHeight: 22 * scale }]}>Quest</Text>
        </TouchableOpacity>
      </View>
      {menuVisible && <HomeMenuPanel {...menuProps} scale={scale} onClose={() => setMenuVisible(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 10 },
  button: { position: 'absolute' },
  count: { position: 'absolute', color: DesignPaint.ink, fontFamily: DesignFonts.regular, includeFontPadding: false },
  brand: { position: 'absolute', color: DesignPaint.ink, fontFamily: DesignFonts.bold, includeFontPadding: false },
  quest: { position: 'absolute', color: DesignPaint.ink, fontFamily: DesignFonts.bold, textAlign: 'center', includeFontPadding: false },
});
