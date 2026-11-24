import { Alert, Platform } from 'react-native';
import { enqueueDialog } from './dialog-queue';

export function showNotice(title: string, message: string) {
  if (Platform.OS === 'web') void enqueueDialog({ title, message, confirmLabel: '확인' });
  else Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') confirmChoice(title, message, '삭제', onConfirm);
  else Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);
}

export function confirmChoice(title: string, message: string, okLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    void enqueueDialog({ title, message, confirmLabel: okLabel, cancelLabel: '취소' })
      .then(confirmed => { if (confirmed) onConfirm(); });
  } else {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel' },
      { text: okLabel, onPress: onConfirm },
    ]);
  }
}
