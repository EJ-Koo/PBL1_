import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuCalendarIcon, MenuChevron, MenuDecoration, MenuNotificationToggle, MenuSearchIcon } from './menu-decoration';
import { MenuSlider } from './menu-slider';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import type { Settings } from '@/lib/journal';

type AccordionId = 'music' | 'theme' | 'logout' | 'delete-account';
type NumericSetting = 'backgroundVolume' | 'effectVolume' | 'rotationSensitivity';
type Props = {
  scale: number;
  onClose: () => void;
  settings: Settings;
  purchases: string[];
  notificationBusy: boolean;
  onVolumePreview: (kind: 'backgroundVolume' | 'effectVolume', value: number) => void;
  onSetting: (kind: NumericSetting | 'music' | 'theme', value: number | string) => void;
  onToggleNotifications: () => void;
  onAction: (action: string) => void;
};

function MenuAccordion({ scale, title, expanded, onToggle, children }: {
  scale: number; title: string; expanded: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }}
        onPress={onToggle} style={{ minHeight: 36 * scale, paddingHorizontal: 8 * scale, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[styles.label, { fontSize: 16 * scale, lineHeight: 24 * scale }]}>{title}</Text>
        <MenuChevron scale={scale} expanded={expanded} />
      </Pressable>
      {expanded && <View style={{ padding: 8 * scale, paddingTop: 0, gap: 4 * scale }}>{children}</View>}
    </View>
  );
}

export function HomeMenuPanel({ scale, onClose, settings, purchases, notificationBusy, onSetting, onVolumePreview, onToggleNotifications, onAction }: Props) {
  const [expanded, setExpanded] = useState<Partial<Record<AccordionId, boolean>>>({});
  const [preview, setPreview] = useState<Partial<Record<NumericSetting, number>>>({});
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const top = Math.max(54 * scale, insets.top - 10 * scale) + 79 * scale;
  const bottomSpace = Math.max(34 * scale, insets.bottom) + 30 * scale;
  const visibleHeight = Math.min(558 * scale, Math.max(0, height - top - bottomSpace - 14 * scale));
  const type = (fontSize = 16, lineHeight = 24) => ({ fontSize: fontSize * scale, lineHeight: lineHeight * scale });
  const toggle = (id: AccordionId) => setExpanded((value) => ({ ...value, [id]: !value[id] }));
  const heading = (text: string) => <Text style={[styles.label, styles.heading, { marginLeft: 10 * scale, marginBottom: 4 * scale }, type(20, 28)]}>{text}</Text>;
  const divider = <View style={{ height: 1.5 * scale, marginVertical: 8 * scale, backgroundColor: DesignPaint.menuText }} />;
  const sliderRow = (key: NumericSetting, label: string, accessibilityLabel: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 * scale, marginLeft: 10 * scale }}>
      <Text style={[styles.label, { width: 50 * scale }, type(14, 22)]}>{label}</Text>
      <MenuSlider scale={scale} label={accessibilityLabel} value={preview[key] ?? settings[key]}
        min={key === 'rotationSensitivity' ? 25 : 0} max={key === 'rotationSensitivity' ? 200 : 100}
        onPreview={(value) => {
          setPreview((previous) => ({ ...previous, [key]: value }));
          if (key !== 'rotationSensitivity') onVolumePreview(key, value);
        }}
        onChange={(value) => onSetting(key, value)} />
      <Text style={[styles.label, { width: 41 * scale, textAlign: 'right' }, type(14, 22)]}>{preview[key] ?? settings[key]}%</Text>
    </View>
  );

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable accessibilityLabel="메뉴 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.panel, { left: insets.left + 15 * scale, top, width: 262 * scale, height: visibleHeight }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><MenuDecoration scale={scale} height={visibleHeight} /></View>
        <ScrollView
          accessibilityLabel="설정 메뉴"
          style={{ flex: 1, marginVertical: 8 * scale }}
          bounces={false}
          showsVerticalScrollIndicator
          indicatorStyle="white"
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingHorizontal: 22 * scale, paddingTop: 15 * scale, paddingBottom: 24 * scale }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * scale, marginBottom: 13 * scale }}>
            <Pressable accessibilityRole="button" accessibilityLabel="일기 내용 검색" onPress={() => onAction('search')}
              style={{ flex: 1, minHeight: 34 * scale, borderWidth: 2 * scale, borderColor: DesignPaint.ink, paddingHorizontal: 5 * scale, flexDirection: 'row', alignItems: 'center', gap: 4 * scale }}>
              <MenuSearchIcon scale={scale} />
              <Text style={[styles.label, { color: DesignPaint.ink }, type(14, 21)]}>일기 내용 검색</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="날짜로 일기 찾기" onPress={() => onAction('calendar')}
              style={{ width: 26 * scale, minHeight: 34 * scale, alignItems: 'center', justifyContent: 'center' }}>
              <MenuCalendarIcon scale={scale} />
            </Pressable>
          </View>

          <MenuAccordion scale={scale} title="배경음악" expanded={!!expanded.music} onToggle={() => toggle('music')}>
            {[
              { value: 'space', label: '우주 산책' }, { value: 'night', label: '고요한 밤' }, { value: 'off', label: '음악 끄기' },
            ].map((option) => (
              <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
                accessibilityState={{ checked: settings.music === option.value }} onPress={() => onSetting('music', option.value)}
                style={{ minHeight: 36 * scale, justifyContent: 'center', paddingHorizontal: 8 * scale }}>
                <Text style={[styles.label, type(14, 22)]}>{settings.music === option.value ? '●' : '○'}  {option.label}</Text>
              </Pressable>
            ))}
          </MenuAccordion>
          <MenuAccordion scale={scale} title="테마" expanded={!!expanded.theme} onToggle={() => toggle('theme')}>
            {[
              { value: 'original', label: '기본 우주' }, { value: 'blue', label: '푸른 우주' }, { value: 'black', label: '검은 우주' },
            ].map((option) => (
              <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
                accessibilityState={{ checked: settings.theme === option.value }} onPress={() => onSetting('theme', option.value)}
                style={{ minHeight: 36 * scale, justifyContent: 'center', paddingHorizontal: 8 * scale }}>
                <Text style={[styles.label, type(14, 22)]}>{settings.theme === option.value ? '●' : '○'}  {option.label}{option.value !== 'original' && !purchases.includes(option.value) ? ' · 50 코인' : ''}</Text>
              </Pressable>
            ))}
          </MenuAccordion>

          {divider}
          {heading('소리')}
          {sliderRow('backgroundVolume', '배경음', '배경음 음량')}
          {sliderRow('effectVolume', '효과음', '효과음 음량')}

          {divider}
          {heading('회전 민감도')}
          {sliderRow('rotationSensitivity', '민감도', '우주 회전 민감도')}

          {divider}
          {heading('알림')}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 10 * scale, minHeight: 44 * scale }}>
            <Text style={[styles.label, type()]}>알림 설정</Text>
            <Pressable accessibilityRole="switch" accessibilityLabel="매일 오후 9시 일기 알림"
              accessibilityState={{ checked: settings.notifications, disabled: notificationBusy }}
              disabled={notificationBusy} onPress={onToggleNotifications}
              style={{ minHeight: 44 * scale, width: 44 * scale, alignItems: 'center', justifyContent: 'center' }}>
              <MenuNotificationToggle scale={scale} enabled={settings.notifications} />
            </Pressable>
          </View>

          {divider}
          {heading('계정관리')}
          <MenuAccordion scale={scale} title="로그아웃" expanded={!!expanded.logout} onToggle={() => toggle('logout')}>
            <Text style={[styles.label, type(13, 20)]}>현재 로그인 없이 사용 중입니다.</Text>
            <Pressable accessibilityRole="button" onPress={() => onAction('logout')}
              style={[styles.accountButton, { minHeight: 36 * scale, padding: 6 * scale }]}>
              <Text style={[styles.label, type(14, 22)]}>로그아웃 안내 확인</Text>
            </Pressable>
          </MenuAccordion>
          <MenuAccordion scale={scale} title="회원 탈퇴" expanded={!!expanded['delete-account']} onToggle={() => toggle('delete-account')}>
            <Text style={[styles.label, type(13, 20)]}>회원 탈퇴는 연결된 계정이 있을 때 진행할 수 있습니다.</Text>
            <Pressable accessibilityRole="button" onPress={() => onAction('delete-account')}
              style={[styles.accountButton, { minHeight: 36 * scale, padding: 6 * scale }]}>
              <Text style={[styles.label, type(14, 22)]}>회원 탈퇴 안내 확인</Text>
            </Pressable>
          </MenuAccordion>

          {divider}
          <Pressable accessibilityRole="button" onPress={() => onAction('terms')}
            style={{ minHeight: 36 * scale, justifyContent: 'center', paddingHorizontal: 10 * scale }}>
            <Text style={[styles.label, type()]}>이용약관</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 },
  panel: { position: 'absolute', overflow: 'hidden' },
  label: { color: DesignPaint.menuText, fontFamily: DesignFonts.regular, includeFontPadding: false },
  heading: { fontFamily: DesignFonts.bold, fontWeight: '700' },
  accountButton: { borderWidth: 1, borderColor: DesignPaint.menuText, alignItems: 'center' },
});
