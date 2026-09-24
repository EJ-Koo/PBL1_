import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDiary } from '@/store/diary-context';

export default function LoginScreen() {
  const { login } = useDiary();

  const handleDummyLogin = () => {
    login();
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>오늘의별일</Text>
      <Text style={styles.subtitle}>기록할수록 커지는 나만의 기억 우주</Text>

      <View style={styles.form}>
        <View style={styles.inputBox}>
          <Text style={styles.inputPlaceholder}>이메일 (목업 — 입력 불필요)</Text>
        </View>
        <View style={styles.inputBox}>
          <Text style={styles.inputPlaceholder}>비밀번호 (목업 — 입력 불필요)</Text>
        </View>
      </View>

      <Pressable style={styles.loginButton} onPress={handleDummyLogin}>
        <Text style={styles.loginButtonText}>로그인</Text>
      </Pressable>

      <Pressable onPress={handleDummyLogin}>
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
  inputBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#2A2A45',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#14142A',
  },
  inputPlaceholder: {
    color: '#5F5F80',
    fontSize: 14,
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#7C6CF6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
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
