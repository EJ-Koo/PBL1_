// [MODIFIED 2026-11-05] fffju 메뉴 외관은 그대로 두고, 동작을 서버 구조에 맞게 연결함.
//  - "일기 내용 검색" → 검색 화면(/search, 최근 검색어 표시), 달력 아이콘 → 검색 화면을 달력이 펼쳐진 채로 연다.
//    (기존 fffju의 팝업 JournalDialog는 삭제)
//  - 회전 민감도 → lib/settings.ts (0.1~1.5배, 기기에 저장)
//  - 로그아웃 → 실제 로그아웃 후 로그인 화면
//  - 서버 기능이 아직 없는 항목(배경음악·테마·소리·알림·회원 탈퇴·이용약관)은 값만 보여주고 눌러도 반응하지 않는다.
//    펼치기/접기(아코디언)만 동작한다. 나중에 기능이 생기면 하나씩 연결.
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MenuCalendarIcon, MenuChevron, MenuDecoration, MenuNotificationToggle, MenuSearchIcon } from './menu-decoration';
import { MenuSlider } from './menu-slider';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

import { DesignFonts, DesignPaint } from '@/constants/ui-design';
import { ROTATE_SENSITIVITY_MAX, ROTATE_SENSITIVITY_MIN } from '@/lib/settings';

type AccordionId = 'logout' | 'delete-account';

// 서버 기능이 생기기 전까지 화면에 보여줄 고정값 (fffju 기본 설정과 동일)
const PLACEHOLDER = {
  backgroundVolume: 60,
  effectVolume: 40,
  notifications: false,
} as const;

type Props = {
  scale: number;
  onClose: () => void;
  onSearch: () => void;
  onCalendar: () => void;
  onLogout: () => void;
  // 회전 민감도 (배수, 0.1~1.5)
  sensitivity: number;
  onSensitivity: (value: number) => void;
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

/** 아직 기능이 없는 부분: 흐리게 보이고 눌리지 않는다. */
function Inactive({ children }: { children: ReactNode }) {
  return (
    <View style={styles.inactive} pointerEvents="none" accessibilityState={{ disabled: true }}>
      {children}
    </View>
  );
}

export function HomeMenuPanel({ scale, onClose, onSearch, onCalendar, onLogout, sensitivity, onSensitivity }: Props) {
  const [expanded, setExpanded] = useState<Partial<Record<AccordionId, boolean>>>({});
  const [sensitivityPreview, setSensitivityPreview] = useState<number | null>(null);
  const { height, chromeLeft, headerTop, bottomSpace } = useResponsiveLayout();
  const top = headerTop + 79 * scale;
  const visibleHeight = Math.min(558 * scale, Math.max(0, height - top - bottomSpace - 14 * scale));
  const type = (fontSize = 16, lineHeight = 24) => ({ fontSize: fontSize * scale, lineHeight: lineHeight * scale });
  const toggle = (id: AccordionId) => setExpanded((value) => ({ ...value, [id]: !value[id] }));
  const heading = (text: string) => <Text style={[styles.label, styles.heading, { marginLeft: 10 * scale, marginBottom: 4 * scale }, type(20, 28)]}>{text}</Text>;
  const divider = <View style={{ height: 1.5 * scale, marginVertical: 8 * scale, backgroundColor: DesignPaint.menuText }} />;
  const volumeRow = (label: string, value: number) => (
    <Inactive>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 * scale, marginLeft: 10 * scale }}>
        <Text style={[styles.label, { width: 50 * scale }, type(14, 22)]}>{label}</Text>
        <MenuSlider scale={scale} label={label} value={value} onPreview={() => {}} onChange={() => {}} />
        <Text style={[styles.label, { width: 41 * scale, textAlign: 'right' }, type(14, 22)]}>{value}%</Text>
      </View>
    </Inactive>
  );
  // 슬라이더는 정수 단위라 배수 × 100으로 다룬다 (예: 1.0배 = 100).
  const sensitivityValue = sensitivityPreview ?? Math.round(sensitivity * 100);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable accessibilityLabel="메뉴 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={[styles.panel, { left: chromeLeft + 15 * scale, top, width: 262 * scale, height: visibleHeight }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><MenuDecoration scale={scale} height={visibleHeight} /></View>
        {/* 아코디언을 펼치면 내용이 길어지므로 메뉴 안에서 세로 스크롤된다. */}
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
            <Pressable accessibilityRole="button" accessibilityLabel="일기 내용 검색" onPress={() => { onClose(); onSearch(); }}
              style={{ flex: 1, minHeight: 34 * scale, borderWidth: 2 * scale, borderColor: DesignPaint.ink, paddingHorizontal: 5 * scale, flexDirection: 'row', alignItems: 'center', gap: 4 * scale }}>
              <MenuSearchIcon scale={scale} />
              <Text style={[styles.label, { color: DesignPaint.ink }, type(14, 21)]}>일기 내용 검색</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="날짜로 일기 찾기" onPress={() => { onClose(); onCalendar(); }}
              style={{ width: 26 * scale, minHeight: 34 * scale, alignItems: 'center', justifyContent: 'center' }}>
              <MenuCalendarIcon scale={scale} />
            </Pressable>
          </View>

          {/* [MODIFIED 2026-11-10] 배경음악·테마는 상점(배경·음악 탭)으로 옮김 */}
          {divider}
          {heading('소리')}
          {volumeRow('배경음', PLACEHOLDER.backgroundVolume)}
          {volumeRow('효과음', PLACEHOLDER.effectVolume)}

          {divider}
          {heading('회전 민감도')}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 * scale, marginLeft: 10 * scale }}>
            <Text style={[styles.label, { width: 50 * scale }, type(14, 22)]}>민감도</Text>
            <MenuSlider scale={scale} label="우주 회전 민감도" value={sensitivityValue}
              min={Math.round(ROTATE_SENSITIVITY_MIN * 100)} max={Math.round(ROTATE_SENSITIVITY_MAX * 100)}
              onPreview={setSensitivityPreview}
              onChange={(value) => {
                setSensitivityPreview(null);
                onSensitivity(value / 100);
              }} />
            <Text style={[styles.label, { width: 41 * scale, textAlign: 'right' }, type(14, 22)]}>{(sensitivityValue / 100).toFixed(1)}배</Text>
          </View>

          {divider}
          {heading('알림')}
          <Inactive>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: 10 * scale, minHeight: 44 * scale }}>
              <Text style={[styles.label, type()]}>알림 설정</Text>
              <View style={{ minHeight: 44 * scale, width: 44 * scale, alignItems: 'center', justifyContent: 'center' }}>
                <MenuNotificationToggle scale={scale} enabled={PLACEHOLDER.notifications} />
              </View>
            </View>
          </Inactive>

          {divider}
          {heading('계정관리')}
          <MenuAccordion scale={scale} title="로그아웃" expanded={!!expanded.logout} onToggle={() => toggle('logout')}>
            <Text style={[styles.label, type(13, 20)]}>로그아웃하면 로그인 화면으로 돌아가요.</Text>
            <Pressable accessibilityRole="button" onPress={() => { onClose(); onLogout(); }}
              style={[styles.accountButton, { minHeight: 36 * scale, padding: 6 * scale }]}>
              <Text style={[styles.label, type(14, 22)]}>로그아웃</Text>
            </Pressable>
          </MenuAccordion>
          <MenuAccordion scale={scale} title="회원 탈퇴" expanded={!!expanded['delete-account']} onToggle={() => toggle('delete-account')}>
            <Text style={[styles.label, type(13, 20)]}>회원 탈퇴는 아직 준비 중이에요.</Text>
            <Inactive>
              <View style={[styles.accountButton, { minHeight: 36 * scale, padding: 6 * scale }]}>
                <Text style={[styles.label, type(14, 22)]}>회원 탈퇴</Text>
              </View>
            </Inactive>
          </MenuAccordion>

          {divider}
          <Inactive>
            <View style={{ minHeight: 36 * scale, justifyContent: 'center', paddingHorizontal: 10 * scale }}>
              <Text style={[styles.label, type()]}>이용약관</Text>
            </View>
          </Inactive>
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
  inactive: { opacity: 0.4 },
});
