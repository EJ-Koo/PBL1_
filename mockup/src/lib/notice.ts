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
