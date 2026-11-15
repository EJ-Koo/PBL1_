import { Text, TextInput } from '@/components/app-text';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { showNotice } from '@/lib/notice';
import { useAdmin } from '@/store/admin-context';

export default function AdminLoginScreen() {
  const { adminLogin } = useAdmin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      showNotice('관리자 로그인', '아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setIsLoggingIn(true);
    const result = await adminLogin(username.trim(), password);
    setIsLoggingIn(false);

    if (result.ok) {
      // typed-routes가 중첩 index 라우트를 '/admin/index'로만 인식하는 버그가 있어 캐스트함.
      // 실제 유효 경로는 '/admin'뿐이고 '/admin/index'는 런타임에 Unmatched Route가 됨.
      router.replace('/admin' as Parameters<typeof router.replace>[0]);
    } else {
      showNotice('로그인 실패', result.error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>관리자 로그인</Text>
      <Text style={styles.subtitle}>오늘의별일 관리자 페이지</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="아이디"
          placeholderTextColor="#5F5F80"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TextInput
          ref={passwordRef}
          style={styles.input}
          placeholder="비밀번호"
          placeholderTextColor="#5F5F80"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />
      </View>

      <Pressable
        style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]}
        onPress={handleLogin}
        disabled={isLoggingIn}
      >
        <Text style={styles.loginButtonText}>
          {isLoggingIn ? '로그인 중...' : '로그인'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#9C9CC0',
    marginBottom: 32,
  },
  form: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2A2A45',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#14142A',
    color: '#FFFFFF',
    fontSize: 14,
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#7C6CF6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
