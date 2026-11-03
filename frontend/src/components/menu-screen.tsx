// ☰ 메뉴 (기존 "다른 우주 구경하기" 자리를 대체).
// 이번에 실제 동작: 일기 검색, 테마 선택지 열기(색 적용은 추후 연동), 회전 민감도, 로그아웃.
// 나머지 항목은 기능이 생길 때까지 눌리지 않게 흐리게 표시한다.
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ValueSlider } from '@/components/value-slider';
import {
  getRotateSensitivity,
  loadSettings,
  ROTATE_SENSITIVITY_MAX,
  ROTATE_SENSITIVITY_MIN,
  setRotateSensitivity,
} from '@/lib/settings';
import { useDiary } from '@/store/diary-context';

const THEMES = ['기본', '파랑', '핑크'] as const;
type ThemeName = (typeof THEMES)[number];

export function MenuScreen({ onClose }: { onClose: () => void }) {
  const { logout } = useDiary();
  const [themeOpen, setThemeOpen] = useState(false);
  // 테마는 선택지만 열어 둔 상태 — 고른 값은 화면 색에 아직 반영하지 않는다(추후 연동).
  const [theme, setTheme] = useState<ThemeName>('기본');
  const [sensitivity, setSensitivity] = useState(getRotateSensitivity());

  // 기기에 저장된 회전 민감도를 불러와 슬라이더 위치에 반영한다.
  useEffect(() => {
    let alive = true;
    loadSettings().then(() => {
      if (alive) setSensitivity(getRotateSensitivity());
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleLogout = () => {
    onClose();
    logout();
    router.replace('/login');
  };

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      {/* 패널 안을 눌렀을 때는 메뉴가 닫히지 않도록 이벤트를 여기서 막는다. */}
      <Pressable style={styles.panel} onPress={() => {}}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>메뉴</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.searchButton}
          onPress={() => {
            // 검색은 독립 화면(/search)으로 연다 — 행성 상세에서 뒤로 오면 검색 화면으로 돌아오게.
            onClose();
            router.push('/search');
          }}
        >
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>일기 검색</Text>
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false}>
          <MenuItem label="배경음" disabled />

          <MenuItem label="테마" onPress={() => setThemeOpen((v) => !v)} trailing={themeOpen ? '▴' : '▾'} />
          {themeOpen && (
            <View style={styles.themeRow}>
              {THEMES.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.themeChip, theme === t && styles.themeChipSelected]}
                  onPress={() => setTheme(t)}
                >
                  <Text style={[styles.themeChipText, theme === t && styles.themeChipTextSelected]}>
                    {theme === t ? `✓ ${t}` : t}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.sliderHeader}>
            <Text style={styles.itemText}>회전 민감도</Text>
            <Text style={styles.itemTrailing}>{sensitivity.toFixed(1)}배</Text>
          </View>
          <ValueSlider
            value={sensitivity}
            min={ROTATE_SENSITIVITY_MIN}
            max={ROTATE_SENSITIVITY_MAX}
            onChange={(v) => setSensitivity(setRotateSensitivity(v))}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>느리게</Text>
            <Text style={styles.sliderLabelText}>빠르게</Text>
          </View>

          <Text style={styles.sectionTitle}>소리</Text>
          <MenuItem label="배경음 음량 조절" disabled />
          <MenuItem label="효과음 음량 조절" disabled />

          <Text style={styles.sectionTitle}>알림</Text>
          <MenuItem label="알림 받을지 말지 설정" disabled />

          <Text style={styles.sectionTitle}>계정관리</Text>
          <MenuItem label="로그아웃" onPress={handleLogout} />
          <MenuItem label="회원 탈퇴" disabled />

          <View style={styles.divider} />
          <MenuItem label="이용 약관" disabled />
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

function MenuItem({
  label,
  onPress,
  disabled = false,
  trailing,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  trailing?: string;
}) {
  return (
    <Pressable
      style={[styles.item, disabled && styles.itemDisabled]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <Text style={styles.itemText}>{label}</Text>
      {trailing ? <Text style={styles.itemTrailing}>{trailing}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#7F8C8D',
    padding: 18,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  panelTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  closeText: { color: '#9C9CC0', fontSize: 18 },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#7F8C8D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#0E0E18',
  },
  searchIcon: { fontSize: 14 },
  searchPlaceholder: { color: '#6E6E90', fontSize: 14 },
  sectionTitle: {
    color: '#9C9CC0',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 2,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  itemDisabled: { opacity: 0.35 },
  itemText: { color: '#FFFFFF', fontSize: 15 },
  itemTrailing: { color: '#9C9CC0', fontSize: 14 },
  themeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  themeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7F8C8D',
  },
  themeChipSelected: { backgroundColor: '#DCDDE1', borderColor: '#DCDDE1' },
  themeChipText: { color: '#FFFFFF', fontSize: 13 },
  themeChipTextSelected: { color: '#111111', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#33334A', marginTop: 14 },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 11,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabelText: { color: '#6E6E90', fontSize: 11 },
});
