import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

import { AdminProvider } from '@/store/admin-context';
import { DiaryProvider } from '@/store/diary-context';

export default function RootLayout() {
  // fffju 디자인 글꼴(Inter). 불러오기에 실패해도 기본 글꼴로 화면은 띄운다.
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_700Bold });
  if (!fontsLoaded && !fontError) return null;

  return (
    <AdminProvider>
      <DiaryProvider>
        <StatusBar style="light" />
        <Stack initialRouteName="login" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="index" />
          <Stack.Screen name="search" />
          <Stack.Screen name="write" />
          <Stack.Screen name="planet/[id]" />
          <Stack.Screen name="admin/login" />
          <Stack.Screen name="admin/index" />
        </Stack>
      </DiaryProvider>
    </AdminProvider>
  );
}
