import { Text, TextInput } from '@/components/app-text';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleAuthButton } from '@/components/google-auth-button';
import { AuthFieldFrame, AuthIcon, AuthLogoFrame, AuthPanelFrame, AuthScreenChrome } from '@/components/ui/auth-decoration';
import { DesignFonts } from '@/constants/ui-design';
import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

export default function LoginScreen() {
  const { login } = useDiary();
  const insets = useSafeAreaInsets();
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const loginLock = useRef(false);
  const handleLogin = async () => {
    if (loginLock.current) return;
    if (!email.trim() || !password) {
      showNotice('로그인', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    loginLock.current = true;
    setIsLoggingIn(true);
    try {
      const result = await login(email.trim(), password);
      if (result.ok) router.replace('/');
      else showNotice('로그인 실패', result.error);
    } catch {
      showNotice('로그인 실패', '잠시 후 다시 시도해주세요.');
    } finally {
      loginLock.current = false;
      setIsLoggingIn(false);
    }
  };

  return <View style={styles.screen}>
    <Image source={require('../../assets/images/login-space-v1.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
    <AuthScreenChrome />
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ScrollView style={styles.fill} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(60, insets.top + 28), paddingBottom: Math.max(80, insets.bottom + 48) }]}>
        <View style={styles.content}>
          <View style={styles.logo}>
            <AuthLogoFrame />
            <Text accessibilityRole="header" style={styles.title}>오늘의별일</Text>
            <Text style={styles.wordmark}>STAR2DAY</Text>
          </View>
          <Text style={styles.subtitle}>기록할수록 커지는 나만의 우주</Text>
          <View style={styles.panel}>
            <AuthPanelFrame />
            <View style={styles.field}>
              <AuthFieldFrame focused={focusedField === 'email'} /><AuthIcon kind="email" />
              <TextInput accessibilityLabel="이메일" style={styles.input} placeholder="이메일" placeholderTextColor="#9094a3"
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
                onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                value={email} onChangeText={setEmail} editable={!isLoggingIn} returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()} blurOnSubmit={false} />
            </View>
            <View style={styles.field}>
              <AuthFieldFrame focused={focusedField === 'password'} /><AuthIcon kind="lock" />
              <TextInput ref={passwordRef} accessibilityLabel="비밀번호" style={styles.input} placeholder="비밀번호" placeholderTextColor="#9094a3"
                onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword} value={password} onChangeText={setPassword} editable={!isLoggingIn}
                autoComplete="current-password" textContentType="password" autoCapitalize="none" returnKeyType="done" onSubmitEditing={handleLogin} />
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                accessibilityState={{ selected: showPassword }} onPress={() => setShowPassword(value => !value)} hitSlop={8}>
                <AuthIcon kind={showPassword ? 'eye' : 'eye-off'} />
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: isLoggingIn, busy: isLoggingIn }}
              style={({ pressed }) => [styles.loginButton, (pressed || isLoggingIn) && styles.dimmed]} onPress={handleLogin} disabled={isLoggingIn}>
              <AuthFieldFrame primary />
              <Text style={styles.loginButtonText}>{isLoggingIn ? '로그인 중…' : '로그인'}</Text>
              <Text style={styles.loginArrow}>»</Text>
            </Pressable>
            <GoogleAuthButton variant="space" />
          </View>
          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>계정이 없으신가요?</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/signup')} hitSlop={8}>
              <Text style={styles.signupLink}>회원가입</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#03040a' }, fill: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  content: { width: '100%', maxWidth: 360, alignItems: 'center' },
  logo: { width: 300, maxWidth: '100%', height: 66, paddingLeft: 18, justifyContent: 'center' },
  title: { color: '#ececf3', fontFamily: DesignFonts.bold, fontWeight: '700', fontSize: 28, lineHeight: 34 },
  wordmark: { color: '#aeb2c1', fontFamily: DesignFonts.regular, fontSize: 9, letterSpacing: 7, marginLeft: 3, marginTop: 2 },
  subtitle: { color: '#b9bac7', fontFamily: DesignFonts.regular, fontSize: 12, lineHeight: 20, textAlign: 'center', marginTop: 16, marginBottom: 24 },
  panel: { width: '100%', padding: 22, gap: 12 },
  field: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  input: { ...Platform.select({ web: { outlineWidth: 0 } }), flex: 1, minWidth: 0, height: '100%', padding: 0, fontFamily: DesignFonts.regular, fontSize: 13, color: '#f1f1f7', zIndex: 1 },
  loginButton: { height: 46, alignItems: 'center', justifyContent: 'center' },
  loginButtonText: { color: '#121520', fontFamily: DesignFonts.bold, fontSize: 14, fontWeight: '700', zIndex: 1 },
  loginArrow: { position: 'absolute', right: 14, top: 5, fontSize: 30, lineHeight: 34, color: '#171c28' },
  dimmed: { opacity: 0.6 }, signupRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 18 },
  signupPrompt: { color: '#9297a8', fontSize: 11 }, signupLink: { color: '#c6c9d5', fontSize: 11, textDecorationLine: 'underline' },
});
