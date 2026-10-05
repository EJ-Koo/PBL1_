import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

export default function LoginScreen() {
  const { login } = useDiary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showNotice('로그인', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setIsLoggingIn(true);
    const result = await login(email.trim(), password);
    setIsLoggingIn(false);

    if (result.ok) {
      router.replace('/');
    } else {
      showNotice('로그인 실패', result.error);
    }
  };

  const handleSignup = () => {
    router.push('/signup');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>오늘의별일</Text>
      <Text style={styles.subtitle}>기록할수록 커지는 나만의 우주</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor="#5F5F80"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
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

      <Pressable onPress={handleSignup}>
        <Text style={styles.signupLink}>계정이 없으신가요? 회원가입</Text>
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
  signupLink: {
    color: '#9C9CC0',
    fontSize: 13,
    marginTop: 16,
  },
});
