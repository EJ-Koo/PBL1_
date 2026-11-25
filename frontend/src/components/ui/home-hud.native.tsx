import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { DesignFonts } from '@/constants/ui-design';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useLanguage } from '@/lib/language';
import { HudIcon, QuestFrame } from './design-decoration';
import { HomeMenuPanel } from './home-menu-panel';
import type { HomeHudProps } from './home-hud.types';

// Readable labels and 44dp touch targets are independent of decorative chrome.
export function HomeHud({ scale, starCount, coinCount, checkCount, onStats, onQuest, menuVisible, onToggleMenu, onCloseMenu, menuProps }: HomeHudProps) {
  const { t } = useLanguage();
  const { headerTop, chromeLeft, chromeWidth } = useResponsiveLayout();
  return <>
    <View style={[styles.bar, { top: headerTop, left: chromeLeft + 8, width: chromeWidth - 16 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('메뉴')} accessibilityState={{ expanded: menuVisible }}
        onPress={onToggleMenu} style={styles.menu}>
        {[0,1,2].map(i => <View key={i} style={styles.menuLine} />)}
      </Pressable>
      <View style={styles.stats}>
        <View style={styles.stat}><HudIcon kind="star" scale={0.65}/><Text numberOfLines={1} style={styles.number}>{starCount.toLocaleString()}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('상점')} testID="home-shop-coin" onPress={onStats} style={styles.stat}>
          <HudIcon kind="coin" scale={0.7}/><Text numberOfLines={1} style={styles.number}>{coinCount.toLocaleString()}</Text>
        </Pressable>
        <View style={styles.stat}><HudIcon kind="check" scale={0.65}/><Text numberOfLines={1} style={styles.number}>{checkCount.toLocaleString()}</Text></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('퀘스트')}
        onPress={() => { onCloseMenu(); onQuest(); }} style={styles.quest}>
        <View pointerEvents="none" style={styles.questFrame}><QuestFrame scale={0.7} width={58}/></View>
        <Text style={styles.questText}>Quest</Text>
      </Pressable>
    </View>
    {menuVisible && <HomeMenuPanel {...menuProps} scale={scale} onClose={onCloseMenu}/>}
  </>;
}
const styles = StyleSheet.create({
  bar: { position: 'absolute', zIndex: 10, height: 48, flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#777' },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', gap: 5 },
  menuLine: { width: 20, height: 1, backgroundColor: '#eee' },
  stats: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  stat: { minHeight: 44, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  number: { fontSize: 13, lineHeight: 20, flexShrink: 1, color: '#fff', fontFamily: DesignFonts.regular },
  quest: { width: 60, height: 44, alignItems: 'center', justifyContent: 'center' },
  questFrame: { position: 'absolute' },
  questText: { color: '#fff', fontSize: 13, lineHeight: 20, fontFamily: DesignFonts.bold },
});
