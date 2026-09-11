import { Platform } from 'react-native';
import { buildSchedules } from './notifications';
import { getNotif, safeNotif } from './notifCompat';

async function setupHandler() {
  const mod = await getNotif();
  if (!mod) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification?.request?.content?.data;
        if (data?.action === 'PING_LOCATION' || data?.type === 'PING_LOCATION') {
          return {
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        }
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      },
    });
  } catch (e) {}
}

setupHandler();

let configured = false;

async function ensureChannel() {
  if (configured) return;
  if (Platform.OS === 'android') {
    await safeNotif(async (mod) => {
      await mod.setNotificationChannelAsync('default', {
        name: 'Notifikasi GGC Work',
        importance: mod.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
        sound: 'default',
      });
      await mod.setNotificationChannelAsync('chat_messages', {
        name: 'Pesan Chat GGC Work',
        importance: mod.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563eb',
        sound: 'default',
      });
      await mod.setNotificationChannelAsync('downloads', {
        name: 'Download File',
        importance: mod.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100],
        lightColor: '#2563eb',
        sound: null,
      });
    });
  }
  configured = true;
}

export async function requestNotifPermission() {
  try {
    await ensureChannel();
    const granted = await safeNotif(async (mod) => {
      const settings = await mod.getPermissionsAsync();
      let status = settings.status;
      if (status !== 'granted') {
        const req = await mod.requestPermissionsAsync();
        status = req.status;
      }
      return status === 'granted';
    }, false);
    return !!granted;
  } catch (e) {
    return false;
  }
}

export async function cancelAllReminders() {
  try {
    await safeNotif(async (mod) => {
      const all = await mod.getAllScheduledNotificationsAsync();
      const ids = all
        .filter((n) => n.content?.data?.kind === 'reminder')
        .map((n) => n.identifier);
      await Promise.all(ids.map((id) => mod.cancelScheduledNotificationAsync(id)));
    });
  } catch (e) {}
}

export async function syncReminders(props) {
  try {
    await ensureChannel();
    await safeNotif(async (mod) => {
      const desired = buildSchedules(props);
      const desiredKeys = new Set(desired.map((d) => d.key));
      const scheduled = await mod.getAllScheduledNotificationsAsync();
      const stale = scheduled
        .filter((n) => n.content?.data?.kind === 'reminder')
        .filter((n) => !desiredKeys.has(n.content.data.key));
      await Promise.all(
        stale.map((n) => mod.cancelScheduledNotificationAsync(n.identifier))
      );

      const haveKeys = new Set(
        scheduled
          .filter((n) => n.content?.data?.kind === 'reminder')
          .map((n) => n.content?.data?.key)
      );

      for (const d of desired) {
        if (haveKeys.has(d.key)) continue;
        await mod.scheduleNotificationAsync({
          content: {
            title: d.title,
            body: d.message,
            data: { key: d.key, kind: 'reminder', type: d.type },
            sound: 'default',
          },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.DATE,
            date: d.date,
            channelId: 'default',
          },
        });
      }
    });
  } catch (e) {}
}