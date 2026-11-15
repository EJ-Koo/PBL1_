import { Text, TextInput } from '@/components/app-text';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GoogleAuthButton } from '@/components/google-auth-button';
import { AuthIcon } from '@/components/ui/auth-decoration';
import { LoginFocusReset } from '@/components/ui/login-focus-reset';
import { SpaceDialogFrame } from '@/components/ui/space-dialog';
import { showNotice } from '@/lib/notice';
import { useDiary } from '@/store/diary-context';

export default function SignupScreen() {
  const { signup } = useDiary();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lock = useRef(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const handleSignup = async () => {
    if (lock.current) return;
    if (!email.trim() || !password || !confirmPassword) {
      showNotice('회원가입', '이메일과 비밀번호를 모두 입력해주세요.'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showNotice('회원가입', '이메일 형식을 확인해주세요.'); return;
    }
    if (password !== confirmPassword) {
      showNotice('회원가입', '비밀번호가 일치하지 않습니다.'); return;
    }
    lock.current = true; setIsSubmitting(true);
    try {
      const result = await signup(email.trim(), password);
      if (!result.ok) { showNotice('회원가입 실패', result.error); return; }
      if (result.emailConfirmationRequired) {
        showNotice('회원가입 완료', '입력하신 이메일로 인증 메일을 보냈어요. 확인 후 로그인해주세요.');
        router.replace('/login');
      } else router.replace('/');
    } catch { showNotice('회원가입 실패', '잠시 후 다시 시도해주세요.'); }
    finally { lock.current = false; setIsSubmitting(false); }
  };
  return <View style={styles.screen}>
    <Image source={require('../../assets/images/login-space-v1.png')} style={StyleSheet.absoluteFill} resizeMode="cover" />
    <LoginFocusReset />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: Math.max(36, insets.top + 20), paddingBottom: Math.max(40, insets.bottom + 24) }}>
        <View style={{ width: '100%', maxWidth: 500, alignItems: 'center' }}>
          <View style={{ width: '100%', height: 92, justifyContent: 'center', alignItems: 'center' }}>
            <Svg width="100%" height={92} viewBox="0 0 500 92" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
              <Path d="M90 22H112L136 2H366L379 14 M126 76L139 87H365L389 64H410" fill="none" stroke="#c4c8d3" strokeWidth={1.2} />
              <Path d="M8 44L23 29H33L18 44Z M27 44L42 29H52L37 44Z M46 44L61 29H71L56 44Z M65 44L80 29H90L75 44Z M414 44L429 29H439L424 44Z M433 44L448 29H458L443 44Z M452 44L467 29H477L462 44Z M471 44L486 29H496L481 44Z" fill="#e0e2e9" />
            </Svg>
            <Text accessibilityRole="header" style={{ color: '#f4f4f8', fontSize: 34, lineHeight: 44, fontWeight: '700' }}>회원가입</Text>
          </View>
          <Text style={{ color: '#d1d3de', fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>기록할수록 커지는 나만의 우주</Text>
          <View style={{ width: '100%', paddingHorizontal: 28, paddingVertical: 36, gap: 16 }}>
            <SpaceDialogFrame footer />
            <View style={styles.field}><AuthIcon kind="email" />
              <TextInput testID="signup-email" accessibilityLabel="가입 이메일" placeholder="이메일" placeholderTextColor="#9095a4" style={styles.input}
                autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" keyboardType="email-address"
                value={email} onChangeText={setEmail} editable={!isSubmitting} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} blurOnSubmit={false} />
            </View>
            <View style={styles.field}><AuthIcon kind="lock" />
              <TextInput testID="signup-password" ref={passwordRef} accessibilityLabel="가입 비밀번호" placeholder="비밀번호" placeholderTextColor="#9095a4" style={styles.input}
                secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword}
                editable={!isSubmitting} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} blurOnSubmit={false} />
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '가입 비밀번호 숨기기' : '가입 비밀번호 표시'} hitSlop={8} onPress={() => setShowPassword(value => !value)}><AuthIcon kind={showPassword ? 'eye' : 'eye-off'} /></Pressable>
            </View>
            <View style={styles.field}><AuthIcon kind="lock" />
              <TextInput testID="signup-confirm" ref={confirmRef} accessibilityLabel="가입 비밀번호 확인" placeholder="비밀번호 확인" placeholderTextColor="#9095a4" style={styles.input}
                secureTextEntry={!showConfirm} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={confirmPassword} onChangeText={setConfirmPassword}
                editable={!isSubmitting} returnKeyType="done" onSubmitEditing={handleSignup} />
              <Pressable accessibilityRole="button" accessibilityLabel={showConfirm ? '확인 비밀번호 숨기기' : '확인 비밀번호 표시'} hitSlop={8} onPress={() => setShowConfirm(value => !value)}><AuthIcon kind={showConfirm ? 'eye' : 'eye-off'} /></Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="회원가입" accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }} disabled={isSubmitting}
              onPress={handleSignup} style={({ pressed }) => [styles.submit, { opacity: pressed || isSubmitting ? 0.6 : 1 }]}>
              <Text style={{ color: '#151822', fontSize: 17, fontWeight: '700' }}>{isSubmitting ? '가입 중…' : '회원가입'}</Text>
            </Pressable>
            <GoogleAuthButton variant="rounded" />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
              <Text style={{ color: '#b7bdcb', fontSize: 12 }}>이미 계정이 있으신가요?</Text><Pressable accessibilityRole="link" accessibilityLabel="로그인으로 이동" hitSlop={8} onPress={() => router.replace('/login')}><Text style={{ color: '#f2f3f8', fontSize: 12, textDecorationLine: 'underline' }}>로그인</Text></Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#03040a' },
  field: { height: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#7a7e8a', borderRadius: 12, backgroundColor: '#171920b8' },
  input: { flex: 1, minWidth: 0, height: '100%', color: '#f4f5fa', fontSize: 14, padding: 0 },
  submit: { height: 52, marginTop: 10, borderWidth: 1, borderColor: '#f3f4fa', borderRadius: 12, backgroundColor: '#dfe2ec', alignItems: 'center', justifyContent: 'center' },
});
