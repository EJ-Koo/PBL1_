import { useEffect } from 'react';
import { router, useRootNavigationState, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useDiary } from '@/store/diary-context';

export function SessionGuard() {
  const { isRestoring, isLoggedIn, dataLoading } = useDiary();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const page = segments[0] as string | undefined;
  const admin = page === 'admin';
  const publicPage = page === 'login' || page === 'signup';
  useEffect(() => {
    if (!navigation?.key || isRestoring || admin) return;
    if (!isLoggedIn && !publicPage) router.replace('/login');
    else if (isLoggedIn && publicPage) router.replace('/');
  }, [navigation?.key, isRestoring, isLoggedIn, admin, publicPage]);
  if (admin || (!isRestoring && (!isLoggedIn || !dataLoading))) return null;
  return <View accessibilityLabel={isRestoring ? '로그인 복원 중' : '기록 불러오는 중'} style={styles.cover}><ActivityIndicator color="#d4d6e0" /></View>;
}
const styles = StyleSheet.create({ cover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#03040a', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } });
