import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DiaryProvider } from '@/store/diary-context';

export default function RootLayout() {
  return (
    <DiaryProvider>
      <StatusBar style="light" />
      <Stack initialRouteName="login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="index" />
        <Stack.Screen name="write" options={{ presentation: 'modal' }} />
        <Stack.Screen name="planet/[id]" />
      </Stack>
    </DiaryProvider>
  );
}
