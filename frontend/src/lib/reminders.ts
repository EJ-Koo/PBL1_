import { Platform } from 'react-native';

const REMINDER_ID = 'starex-daily-diary';
let pending = Promise.resolve();

// Reconciliation and a user's toggle can overlap after resuming the app.
export function setDiaryReminder(enabled: boolean): Promise<void> {
  const next = pending.catch(() => {}).then(() => configureReminder(enabled));
  pending = next;
  return next;
}

async function configureReminder(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (enabled) throw new Error('매일 일기 알림은 iOS·Android 앱에서 사용할 수 있어요.');
    return;
  }
  const Notifications = await import('expo-notifications');
  if (!enabled) {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    return;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('diary', {
      name: '일기 작성 알림', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('알림 권한이 꺼져 있어요. 기기 설정에서 이 앱의 알림을 허용해주세요.');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: '오늘의 별을 띄워볼까요?', body: '오늘 있었던 이야기를 나의 우주에 남겨보세요.', sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0, channelId: 'diary' },
  });
}

export async function hasReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const Notifications = await import('expo-notifications');
  return (await Notifications.getPermissionsAsync()).granted;
}
