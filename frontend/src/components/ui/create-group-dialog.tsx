import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpaceButton, SpaceIcon, SpaceSurface } from './space-ui';

import { DesignFonts } from '@/constants/ui-design';

type Props = {
  visible: boolean; scale: number; name: string; defaultName: string; saving: boolean;
  onChangeName: (name: string) => void; onClose: () => void; onCreate: () => void;
};

export function CreateGroupDialog({ visible, scale, name, defaultName, saving, onChangeName, onClose, onCreate }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!saving) onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <Pressable accessibilityLabel="그룹 생성 닫기" onPress={onClose} disabled={saving} style={StyleSheet.absoluteFill} />
        <ScrollView keyboardShouldPersistTaps="always" style={{ width: '100%', flexGrow: 0 }}
          contentContainerStyle={{ paddingLeft: insets.left + 25 * scale, paddingRight: insets.right + 25 * scale,
            paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}>
          <SpaceSurface style={{ padding: 23 * scale, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 * scale }}>
              <Text style={[styles.muted, { fontSize: 10 * scale, letterSpacing: 2 }]}>NEW CONSTELLATION</Text>
              <SpaceIcon kind="group" size={36 * scale} />
            </View>
            <Text style={[styles.title, { fontSize: 23 * scale, lineHeight: 32 * scale }]}>우리의 우주 만들기</Text>
            <Text style={[styles.muted, { fontSize: 13 * scale, lineHeight: 21 * scale, marginTop: 10 * scale, marginBottom: 24 * scale }]}>함께 쓴 하루가 모여 하나의 우주가 돼요.{'\n'}만든 그룹은 일기의 공유 목록에 바로 나타나요.</Text>
            <Text style={[styles.text, { fontSize: 13 * scale, marginBottom: 9 * scale }]}>우주의 이름</Text>
            <TextInput accessibilityLabel="새 그룹 이름" value={name} onChangeText={onChangeName} maxLength={24}
              editable={!saving} placeholder={defaultName} placeholderTextColor="#78818d" returnKeyType="done"
              onSubmitEditing={onCreate} style={[styles.input, { fontSize: 16 * scale, padding: 13 * scale }]} />
            <Text style={[styles.muted, { fontSize: 11 * scale, textAlign: 'right', marginTop: 7 * scale }]}>{name.length}/24</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * scale, marginVertical: 22 * scale }}>
              <SpaceIcon kind="star" size={14 * scale} color="#a39bff" />
              <Text style={[styles.muted, { fontSize: 12 * scale, lineHeight: 19 * scale, flex: 1 }]}>내 별부터 시작하는 새로운 우주</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 * scale }}>
              <SpaceButton label="취소" scale={scale} disabled={saving} onPress={onClose} style={{ flex: 1 }} />
              <SpaceButton label={saving ? '만드는 중…' : '우주 만들기'} scale={scale} disabled={saving} onPress={onCreate} primary style={{ flex: 1.5 }} />
            </View>
          </SpaceSurface>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center' },
  title: { color: '#fff', fontFamily: DesignFonts.bold },
  text: { color: '#fff', fontFamily: DesignFonts.regular },
  muted: { color: '#aeb7c4', fontFamily: DesignFonts.regular },
  input: { color: '#fff', fontFamily: DesignFonts.regular, borderWidth: 1, borderColor: '#ffffff66', backgroundColor: '#ffffff08', borderRadius: 4 },
});
