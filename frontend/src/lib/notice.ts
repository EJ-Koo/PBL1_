import { Alert, Platform } from 'react-native';

export function showNotice(title: string, message: string) {
  // RN의 Alert.alert는 웹에서 아무 반응이 없어서, 웹에서는 window.alert로 대체
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export function confirmAction(title: string, message: string, onConfirm: () => void) {
  // RN의 Alert.alert 버튼은 웹에서 동작하지 않아, 웹에서는 window.confirm으로 대체
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: onConfirm },
    ]);
  }
}
