import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

/** 깜빡이는 별 하나. opacity를 랜덤한 주기로 오갔다 갔다 시켜 반짝이는 느낌을 낸다. */
function TwinklingStar({
  left,
  top,
  size,
  duration,
  delay,
}: {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
}) {
  const opacity = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.15, duration, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, duration, delay]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity,
      }}
    />
  );
}

/** 로그인 화면 배경에 깔리는 반짝이는 별 하늘. 터치는 그대로 통과시킨다. */
function StarfieldBackground() {
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 1.6 + 0.8,
        duration: 1200 + Math.random() * 2400,
        delay: Math.random() * 3000,
      })),
    []
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((star, i) => (
        <TwinklingStar key={i} {...star} />
      ))}
    </View>
  );
}

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
      <StarfieldBackground />
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
    maxWidth: 360,
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
    maxWidth: 360,
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
