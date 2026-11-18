import { useLanguage } from '@/lib/language';
import { ScrollView } from '@/components/app-scroll-view';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, TextInput } from '@/components/app-text';
import { LoginFocusReset } from './login-focus-reset';
import { AngularButton, SpaceDialogFrame } from './space-dialog';

export function JoinGroupDialog({ visible, code, joining, onChangeCode, onClose, onJoin }: {
  visible: boolean; code: string; joining: boolean; onChangeCode: (text: string) => void; onClose: () => void; onJoin: () => void;
}) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={() => { if (!joining) onClose(); }}>
    <LoginFocusReset />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable accessibilityLabel={t("그룹 참여 닫기")} disabled={joining} onPress={onClose} style={StyleSheet.absoluteFill} />
      <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%', flexGrow: 0 }} contentContainerStyle={{ paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center' }}>
        <View style={{ width: Math.min(620, width - 32), paddingHorizontal: width < 400 ? 22 : 38, paddingVertical: 30, gap: 22 }}>
          <SpaceDialogFrame footer />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#c7cbd477' }}>
            <Text style={{ color: '#fff', fontSize: 26 }}>🚀</Text><Text accessibilityRole="header" style={{ color: '#fff', fontSize: width < 400 ? 21 : 26, fontWeight: '700', flexShrink: 1 }}>{t("코드로 그룹 참여")}</Text>
          </View>
          <Text style={{ color: '#d5d7df', fontSize: 14, lineHeight: 23 }}>{t("친구에게 받은 방 ID를 입력하면 그 그룹에 바로 참여해요.")}</Text>
          <View style={{ height: 58, justifyContent: 'center', paddingHorizontal: 20 }}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none"><Svg width="100%" height="100%" viewBox="0 0 500 58" preserveAspectRatio="none">
              <Path d="M14 1H486L499 14V44L486 57H14L1 44V14Z M5 18V14L17 5 M479 53H486L495 44" fill="#14161d" stroke="#d6d9e2" strokeWidth={1} />
            </Svg></View>
            <TextInput testID="join-code" accessibilityLabel={t("그룹 참여 코드")} value={code} onChangeText={text => onChangeCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder={t("방 ID 입력")} placeholderTextColor="#858b99" maxLength={8} autoCapitalize="characters" autoCorrect={false} editable={!joining}
              onSubmitEditing={onJoin} returnKeyType="go" style={{ position: 'relative', zIndex: 1, width: '100%', minWidth: 0, backgroundColor: 'transparent', color: '#fff', fontSize: 22, letterSpacing: 3, padding: 0, height: '100%' }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <AngularButton label={t("취소")} disabled={joining} onPress={onClose} style={{ flex: 1, maxWidth: 150 }} />
            <AngularButton label={t(joining ? '참여 중…' : '참여하기')} primary disabled={joining} onPress={onJoin} style={{ flex: 1.4, maxWidth: 220 }} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'center', backgroundColor: '#000b' } });
