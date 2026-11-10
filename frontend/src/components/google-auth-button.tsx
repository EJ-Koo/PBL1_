import { useState } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

// OAuth 리다이렉트로 돌아왔을 때 떠 있던 브라우저 세션을 닫아준다 (expo-auth-session 권장).
WebBrowser.maybeCompleteAuthSession();

/**
 * 구글 로그인/회원가입 버튼. 구글에서 ID 토큰을 받아 백엔드로 넘기면 가입/로그인이 한 흐름으로 처리된다.
 * 클라이언트 ID는 EXPO_PUBLIC_GOOGLE_*_CLIENT_ID 환경변수로 주입한다. 없으면 요청이 만들어지지 않아 버튼이 비활성화된다.
 */
// [FIXED 2026-11-10] 클라이언트 ID가 비어 있으면 expo-auth-session 이 "Client Id property ... must be defined"
// 오류를 던져 로그인·회원가입 화면 전체가 열리지 않았다(.env 가 없는 팀원 PC).
// → 지금 플랫폼의 ID가 없으면 구글 훅을 아예 부르지 않고 비활성 버튼만 보여준다.
const PLATFORM_CLIENT_ID = Platform.select({
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
});

export function GoogleAuthButton() {
  if (!PLATFORM_CLIENT_ID) {
    return (
      <Pressable style={[styles.button, styles.disabled]} disabled accessibilityState={{ disabled: true }}>
        <Text style={styles.text}>Google로 계속하기 (설정 필요)</Text>
      </Pressable>
    );
  }
  return <GoogleAuthButtonInner />;
}

function GoogleAuthButtonInner() {
  const { loginWithGoogle } = useDiary();
  const [busy, setBusy] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const onPress = async () => {
    setBusy(true);
    try {
      const res = await promptAsync();
      if (res?.type !== 'success') return; // 사용자가 취소/닫음
      const idToken = res.params?.id_token;
      if (!idToken) {
        showNotice('Google 로그인 실패', '토큰을 받지 못했습니다.');
        return;
      }
      const result = await loginWithGoogle(idToken);
      if (result.ok) router.replace('/');
      else showNotice('Google 로그인 실패', result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      style={[styles.button, (!request || busy) && styles.disabled]}
      onPress={onPress}
      disabled={!request || busy}
    >
      <Text style={styles.text}>{busy ? '처리 중...' : 'Google로 계속하기'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    color: '#1F1F33',
    fontSize: 16,
    fontWeight: '600',
  },
});
