import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GoogleAuthButton } from '@/components/google-auth-button';
import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

export default function SignupScreen() {
  const { signup } = useDiary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignup = async () => {
    if (!email.trim() || !password || !confirmPassword) {
      showNotice('회원가입', '이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    if (password !== confirmPassword) {
      showNotice('회원가입', '비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    const result = await signup(email.trim(), password);
    setIsSubmitting(false);

    if (!result.ok) {
      showNotice('회원가입 실패', result.error);
      return;
    }

    if (result.emailConfirmationRequired) {
      showNotice('회원가입 완료', '입력하신 이메일로 인증 메일을 보냈어요. 확인 후 로그인해주세요.');
      router.replace('/login');
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>회원가입</Text>
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
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          placeholderTextColor="#5F5F80"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 확인"
          placeholderTextColor="#5F5F80"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
      </View>

      <Pressable
        style={[styles.signupButton, isSubmitting && styles.signupButtonDisabled]}
        onPress={handleSignup}
        disabled={isSubmitting}
      >
        <Text style={styles.signupButtonText}>
          {isSubmitting ? '가입 중...' : '회원가입'}
        </Text>
      </Pressable>

      <GoogleAuthButton />

      <Pressable onPress={() => router.back()}>
        <Text style={styles.loginLink}>이미 계정이 있으신가요? 로그인</Text>
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
  signupButton: {
    width: '100%',
    backgroundColor: '#7C6CF6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signupButtonDisabled: {
    opacity: 0.6,
  },
  signupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loginLink: {
    color: '#9C9CC0',
    fontSize: 13,
    marginTop: 16,
  },
});
