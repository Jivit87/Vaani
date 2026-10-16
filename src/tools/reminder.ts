import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureReady(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return;
  const asked = await Notifications.requestPermissionsAsync();
  if (!asked.granted) throw new Error('notification_permission_denied');
}

export async function setReminder(r: { when: Date; text: string }): Promise<void> {
  await ensureReady();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Reminder', body: r.text },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.when, channelId: CHANNEL_ID },
  });
}
