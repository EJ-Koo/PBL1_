import { loadLanguage } from '@/lib/language';
import { GroupPushGuard } from '@/components/group-push-guard';
import { QuestProvider } from '@/store/quest-context';
import { SessionGuard } from '@/components/session-guard';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { loadSettings } from '@/lib/settings';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DesignFonts, KoreanFonts } from '@/constants/ui-design';

import { AdminProvider } from '@/store/admin-context';
import { DiaryProvider } from '@/store/diary-context';
import { ShopProvider } from '@/store/shop-context';
import { ShopMusic } from '@/components/shop-music';
import { NoticeDialogHost } from '@/components/notice-dialog-host';

export default function RootLayout() {
  useEffect(() => { void loadSettings(); void loadLanguage(); }, []);
  const [fontsLoaded, fontError] = useFonts({
    [DesignFonts.regular]: require('../../assets/fonts/Orbitron-Regular.ttf'),
    [DesignFonts.bold]: require('../../assets/fonts/Orbitron-Bold.ttf'),
    [KoreanFonts.regular]: require('../../assets/fonts/EliceDigitalBaeum_Regular.ttf'),
    [KoreanFonts.bold]: require('../../assets/fonts/EliceDigitalBaeum_Bold.ttf'),
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <AdminProvider>
      <DiaryProvider>
        <ShopProvider>
          <QuestProvider>
          {/* [ADDED 2026-11-10] 상점에서 장착한 배경음악 (모든 화면에서 이어서 재생) */}
          <ShopMusic />
          <StatusBar style="light" />
          <Stack initialRouteName="login" screenOptions={{ headerShown: false, title: '오늘의 별일' }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="index" />
            <Stack.Screen name="search" />
            <Stack.Screen name="archive" />
            <Stack.Screen name="write" />
            <Stack.Screen name="planet/[id]" />
            <Stack.Screen name="admin/login" />
            <Stack.Screen name="admin/index" />
          </Stack>
          <NoticeDialogHost /><SessionGuard /><GroupPushGuard />
          </QuestProvider>
        </ShopProvider>
      </DiaryProvider>
    </AdminProvider>
  );
}
