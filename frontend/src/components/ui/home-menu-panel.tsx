import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScrollView } from '@/components/app-scroll-view';
import { Text } from '@/components/app-text';
import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { useFontScale } from '@/hooks/use-font-scale';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useLanguage } from '@/lib/language';
import { FONT_SCALE_MIN, FONT_SCALE_MAX, setFontScale, ROTATE_SENSITIVITY_MAX, ROTATE_SENSITIVITY_MIN } from '@/lib/settings';

import { MenuCalendarIcon, MenuChevron, MenuDecoration, MenuNotificationToggle, MenuSearchFrame, MenuSearchIcon } from './menu-decoration';
import { MenuSlider } from './menu-slider';

type AccordionId = 'export' | 'logout' | 'delete-account' | 'preferences';

// Sound and notifications are previews until their settings are connected.
const PLACEHOLDER = { backgroundVolume: 60, effectVolume: 40, notifications: false } as const;

type Props = {
  scale: number;
  onClose: () => void;
  onSearch: () => void;
  onCalendar: () => void;
  onLogout: () => void;
  onTutorial?: () => void;
  sensitivity: number;
  onSensitivity: (value: number) => void;
};

function MenuAccordion({ scale, title, expanded, onToggle, children }: {
  scale: number; title: string; expanded: boolean; onToggle: () => void; children: ReactNode;
}) {
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }} onPress={onToggle}
      style={({ pressed }) => ({ minHeight: Math.max(44, 50 * scale), paddingHorizontal: 16 * scale, paddingVertical: 8 * scale,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 * scale, opacity: pressed ? 0.6 : 1 })}>
      <Text style={[styles.label, { flex: 1, fontSize: 19 * scale, lineHeight: 28 * scale }]}>{title}</Text>
      <MenuChevron scale={scale} expanded={expanded} />
    </Pressable>
    {expanded && <View style={{ paddingHorizontal: 16 * scale, paddingTop: 4 * scale, paddingBottom: 12 * scale, gap: 10 * scale }}>{children}</View>}
  </View>;
}

export function HomeMenuPanel({ scale, onClose, onSearch, onCalendar, onLogout, onTutorial, sensitivity, onSensitivity }: Props) {
  const { t, language, setLanguage } = useLanguage();
  const fontScale = useFontScale();
  const [expanded, setExpanded] = useState<Partial<Record<AccordionId, boolean>>>({});
  const [sensitivityPreview, setSensitivityPreview] = useState<number | null>(null);
  const { height, chromeLeft, chromeWidth, headerTop, bottomSpace, hudHeight } = useResponsiveLayout();
  const top = headerTop + hudHeight + 4 * scale;
  const panelWidth = Math.min(352 * scale * Math.max(1, fontScale), chromeWidth - 30 * scale);
  const visibleHeight = Math.min(688 * scale, Math.max(0, height - top - bottomSpace - 14 * scale));
  const type = (fontSize = 19, lineHeight = 28) => ({ fontSize: fontSize * scale, lineHeight: lineHeight * scale });
  const toggle = (id: AccordionId) => setExpanded(value => ({ ...value, [id]: !value[id] }));
  const heading = (text: string) => <Text accessibilityRole="header" style={[styles.label, styles.heading, { marginLeft: 16 * scale }, type(26, 36)]}>{t(text)}</Text>;
  const divider = <View style={{ height: 1.5 * scale, marginTop: 8 * scale, marginBottom: 20 * scale, backgroundColor: DesignPaint.menuText }} />;
  const volumeRow = (label: string, value: number) => <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 * scale, marginLeft: 16 * scale, gap: 10 * scale }}>
    <Text style={[styles.label, { width: 72 * scale * Math.max(1, fontScale) }, type()]}>{t(label)}</Text>
    <MenuSlider scale={scale} label={t(label)} value={value} disabled onPreview={() => {}} onChange={() => {}} />
    <Text style={[styles.label, { width: 46 * scale * Math.max(1, fontScale), textAlign: 'right' }, type(17, 26)]}>{value}%</Text>
  </View>;
  const sensitivityValue = sensitivityPreview ?? Math.round(sensitivity * 100);

  return <View style={styles.overlay} pointerEvents="box-none">
    <Pressable accessibilityLabel={t('메뉴 닫기')} onPress={onClose} style={StyleSheet.absoluteFill} />
    <View accessibilityViewIsModal style={[styles.panel, { left: chromeLeft + 15 * scale, top, width: panelWidth, height: visibleHeight }]}>
      <MenuDecoration scale={scale} height={visibleHeight} width={panelWidth} />
      <ScrollView accessibilityLabel={t('설정 메뉴')} style={{ flex: 1, marginVertical: 15 * scale }}
        bounces={false} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: 24 * scale, paddingTop: 15 * scale, paddingBottom: 24 * scale }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * scale, marginLeft: 7 * scale, marginBottom: 6 * scale }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('일기 내용 검색')} onPress={() => { onClose(); onSearch(); }}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: Math.max(44, 48 * scale), paddingHorizontal: 12 * scale,
              paddingVertical: 8 * scale, flexDirection: 'row', alignItems: 'center', gap: 6 * scale, opacity: pressed ? 0.7 : 1 })}>
            <MenuSearchFrame />
            <MenuSearchIcon scale={scale} />
            <Text style={[styles.label, { flex: 1, color: DesignPaint.ink }, type(17, 26)]}>{t('일기 내용 검색')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('날짜로 일기 찾기')} onPress={() => { onClose(); onCalendar(); }}
            hitSlop={6} style={({ pressed }) => ({ width: 32 * scale, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <MenuCalendarIcon scale={scale} />
          </Pressable>
        </View>
        <View style={{ paddingTop: 3 * scale, paddingBottom: 3 * scale }}>
          <MenuAccordion scale={scale} title={t('일기 내보내기')} expanded={!!expanded.export} onToggle={() => toggle('export')}>
            <Text style={[styles.label, type(14, 22)]}>{t('일기 내보내기는 아직 준비 중이에요.')}</Text>
          </MenuAccordion>
        </View>

        {divider}
        {heading('소리')}
        {volumeRow('배경음', PLACEHOLDER.backgroundVolume)}
        {volumeRow('효과음', PLACEHOLDER.effectVolume)}

        {divider}
        <MenuAccordion scale={scale} title={t('사용자 설정')} expanded={!!expanded.preferences} onToggle={() => toggle('preferences')}>
          <Text style={[styles.label, styles.heading, type(16, 24)]}>{t('민감도')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * scale }}>
            <MenuSlider scale={scale} label={t('우주 조작 민감도')} value={sensitivityValue}
              min={Math.round(ROTATE_SENSITIVITY_MIN * 100)} max={Math.round(ROTATE_SENSITIVITY_MAX * 100)}
              onPreview={setSensitivityPreview} onChange={value => { setSensitivityPreview(null); onSensitivity(value / 100); }} />
            <Text style={[styles.label, type(15, 23)]}>{(sensitivityValue / 100).toFixed(1)}×</Text>
          </View>
          <Text style={[styles.label, styles.heading, { marginTop: 12 * scale }, type(16, 24)]}>{t('글자 크기')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('글자 크기 줄이기')}
              disabled={fontScale <= FONT_SCALE_MIN} accessibilityState={{ disabled: fontScale <= FONT_SCALE_MIN }} onPress={() => setFontScale(fontScale - 0.1)}
              style={[styles.sizeButton, fontScale <= FONT_SCALE_MIN && styles.disabled]}>
              <Text style={[styles.label, type(20, 26)]}>−</Text>
            </Pressable>
            <Text accessibilityLiveRegion="polite" style={[styles.label, type(16, 24)]}>{Math.round(fontScale * 100)}%</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('글자 크기 키우기')}
              disabled={fontScale >= FONT_SCALE_MAX} accessibilityState={{ disabled: fontScale >= FONT_SCALE_MAX }} onPress={() => setFontScale(fontScale + 0.1)}
              style={[styles.sizeButton, fontScale >= FONT_SCALE_MAX && styles.disabled]}>
              <Text style={[styles.label, type(22, 28)]}>+</Text>
            </Pressable>
          </View>

        </MenuAccordion>

        {divider}
        {heading('알림')}
        <View accessible accessibilityRole="switch" accessibilityLabel={t('알림 설정')}
          accessibilityState={{ checked: PLACEHOLDER.notifications, disabled: true }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 16 * scale, minHeight: 64 * scale }}>
          <Text style={[styles.label, { flex: 1, marginRight: 12 * scale }, type()]}>{t('알림 설정')}</Text>
          <MenuNotificationToggle scale={scale} enabled={PLACEHOLDER.notifications} />
        </View>

        {divider}
        {heading('계정관리')}
        {onTutorial && <Pressable accessibilityRole="button" accessibilityLabel={t('튜토리얼 다시 하기')}
          onPress={() => { onClose(); onTutorial(); }}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16 * scale, paddingVertical: 10 * scale, opacity: pressed ? 0.6 : 1 })}>
          <Text style={[styles.label, type(17, 26)]}>{t('튜토리얼 다시 하기')}  ›</Text>
        </Pressable>}
        <MenuAccordion scale={scale} title={t('로그아웃')} expanded={!!expanded.logout} onToggle={() => toggle('logout')}>
          <Text style={[styles.label, type(14, 22)]}>{t('로그아웃하면 로그인 화면으로 돌아가요.')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('로그아웃')} onPress={() => { onClose(); onLogout(); }}
            style={({ pressed }) => [styles.accountButton, { minHeight: 44, padding: 8 * scale, opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.label, type(16, 24)]}>{t('로그아웃')}</Text>
          </Pressable>
        </MenuAccordion>
        <MenuAccordion scale={scale} title={t('회원 탈퇴')} expanded={!!expanded['delete-account']} onToggle={() => toggle('delete-account')}>
          <Text style={[styles.label, type(14, 22)]}>{t('회원 탈퇴는 아직 준비 중이에요.')}</Text>
          <View accessibilityState={{ disabled: true }} style={[styles.accountButton, styles.disabled, { minHeight: 44, padding: 8 * scale }]}>
            <Text style={[styles.label, type(16, 24)]}>{t('회원 탈퇴')}</Text>
          </View>
        </MenuAccordion>

        {divider}
          <Text style={[styles.label, styles.heading, { marginTop: 12 * scale }, type(16, 24)]}>{t('언어 설정')}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('언어 설정')} style={{ flexDirection: 'row', gap: 8 * scale }}>
            {([{ id: 'ko', label: '한국어' }, { id: 'en', label: 'English' }] as const).map(item => <Pressable key={item.id}
              accessibilityRole="radio" accessibilityState={{ checked: language === item.id }} onPress={() => setLanguage(item.id)}
              style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DesignPaint.menuText,
                backgroundColor: language === item.id ? '#101114' : 'transparent' }}>
              <Text style={[styles.label, type(13, 20), language === item.id && { color: '#fff' }]}>{item.label}</Text>
            </Pressable>)}
          </View>
          <Text style={[styles.label, type(12, 19)]}>{t('선택한 언어는 이 기기에 저장돼요.')}</Text>

        {divider}
        <View accessible accessibilityState={{ disabled: true }} style={{ minHeight: 44 * scale, justifyContent: 'center', paddingHorizontal: 16 * scale }}>
          <Text style={[styles.label, type()]}>{t('이용약관')}</Text>
        </View>

      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 },
  panel: { position: 'absolute', overflow: 'hidden' },
  label: { color: DesignPaint.menuText, fontFamily: DesignFonts.regular, includeFontPadding: false },
  heading: { fontFamily: DesignFonts.bold },
  accountButton: { borderWidth: 1, borderColor: DesignPaint.menuText, alignItems: 'center', justifyContent: 'center' },
  sizeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DesignPaint.menuText },
  disabled: { opacity: 0.4 },
});
