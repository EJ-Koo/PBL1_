import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { EquippedCursor } from '@/components/equipped-cursor';
import { AdminProvider } from '@/store/admin-context';
import { DiaryProvider } from '@/store/diary-context';
import { ShopProvider } from '@/store/shop-context';

export default function RootLayout() {
  return (
    <AdminProvider>
      <DiaryProvider>
        <ShopProvider>
          <StatusBar style="light" />
          <Stack initialRouteName="login" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="index" />
            <Stack.Screen name="write" options={{ presentation: 'modal' }} />
            <Stack.Screen name="planet/[id]" />
            <Stack.Screen name="groups/[id]" />
            <Stack.Screen name="admin/login" />
            <Stack.Screen name="admin/index" />
          </Stack>
          <EquippedCursor />
        </ShopProvider>
      </DiaryProvider>
    </AdminProvider>
  );
}
