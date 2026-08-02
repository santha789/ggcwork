import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { buildSchedules } from './notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let configured = false;

async function ensureChannel() {
  if (configured) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Pengingat GGC Work',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563eb',
    });
  }
  configured = true;
}

export async function requestNotifPermission() {
  try {
    await ensureChannel();
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

async function existingKeys() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled
      .map((n) => n.content?.data?.key)
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

export async function cancelAllReminders() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const ids = all
      .filter((n) => n.content?.data?.kind === 'reminder')
      .map((n) => n.identifier);
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch (e) {}
}

export async function syncReminders(props) {
  try {
    await ensureChannel();
    const desired = buildSchedules(props);
    const desiredKeys = new Set(desired.map((d) => d.key));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const stale = scheduled
      .filter((n) => n.content?.data?.kind === 'reminder')
      .filter((n) => !desiredKeys.has(n.content.data.key));
    await Promise.all(
      stale.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    const haveKeys = new Set(
      scheduled
        .filter((n) => n.content?.data?.kind === 'reminder')
        .map((n) => n.content?.data?.key)
    );

    for (const d of desired) {
      if (haveKeys.has(d.key)) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: d.title,
          body: d.message,
          data: { key: d.key, kind: 'reminder', type: d.type },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: d.date,
          channelId: 'default',
        },
      });
    }
  } catch (e) {}
}
