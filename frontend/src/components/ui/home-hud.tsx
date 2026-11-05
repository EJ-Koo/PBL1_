import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeHudFrame, HudIcon, QuestFrame } from './design-decoration';
import { HomeMenuPanel } from './home-menu-panel';
import type { ComponentProps } from 'react';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';

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
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  return (
    <>
      <View
        pointerEvents="box-none"
        // Buttons begin 10dp below the frame, so they stay inside the safe area
        // while the decorative line retains the reference image's y=54 position.
        style={[styles.container, { left: insets.left, top: Math.max(54 * scale, insets.top - 10 * scale), width: 393 * scale, height: 75 * scale }]}>
        <HomeHudFrame scale={scale} />
        <TouchableOpacity
          accessibilityLabel="메뉴"
          onPress={() => setMenuVisible((visible) => !visible)}
          style={[styles.button, { left: 15 * scale, top: 10 * scale, width: 51 * scale, height: 38 * scale }]}
        />
        <TouchableOpacity
          accessibilityLabel="상점"
          onPress={onStats}
          style={[styles.button, { left: 103 * scale, top: 16 * scale, width: 190 * scale, height: 27 * scale }]}>
          {[
            { kind: 'star' as const, value: starCount, x: 0, textX: 24, width: 37 },
            { kind: 'coin' as const, value: coinCount, x: 67, textX: 92, width: 39 },
            { kind: 'check' as const, value: checkCount, x: 134, textX: 157, width: 33 },
          ].map(({ kind, value, x, textX, width }) => (
            <View key={kind} style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={[styles.button, { left: x * scale, top: scale }]}>
                <HudIcon kind={kind} scale={scale} />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.count, { left: textX * scale, top: 3 * scale, width: width * scale, fontSize: 16 * scale, lineHeight: 22 * scale }]}>
                {value}
              </Text>
            </View>
          ))}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setMenuVisible(false);
            onQuest();
          }}
          style={[styles.button, { left: 303 * scale, top: 9 * scale, width: 77 * scale, height: 38 * scale }]}>
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
  quest: { position: 'absolute', color: DesignPaint.ink, fontFamily: DesignFonts.bold, textAlign: 'center', includeFontPadding: false },
});
