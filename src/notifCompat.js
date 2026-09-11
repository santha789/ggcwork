// expo-notifications: remote push dihapus dari Expo Go sejak SDK 53.
// Import (statis ATAU dinamis) tetap akan mengeksekusi side-effect top-level
// modul (DevicePushTokenAutoRegistration) yang throw di Expo Go, sehingga
// memuatnya saja sudah cukup untuk crash. Karena itu helper ini TIDAK PERNAH
// mengeksekusi import() di Expo Go, dan hanya memuat modul pada dev/prod build.

import Constants from 'expo-constants';

let _notifPromise = null;

// Expo Go (bukan development build) → semua fitur expo-notifications off.
function isExpoGo() {
  try {
    return Constants.appOwnership === 'expo';
  } catch (e) {
    return false;
  }
}

export async function getNotif() {
  if (isExpoGo()) {
    console.log('[notif] Expo Go terdeteksi; fitur notifikasi dimatikan.');
    return null;
  }
  if (_notifPromise) return _notifPromise;
  _notifPromise = (async () => {
    try {
      const mod = await import('expo-notifications');
      return mod;
    } catch (e) {
      console.warn('[notif] expo-notifications tidak tersedia di environment ini:', e?.message || e);
      return null;
    }
  })();
  return _notifPromise;
}

export async function safeNotif(fn, fallback) {
  try {
    const mod = await getNotif();
    if (!mod) return fallback;
    return await fn(mod);
  } catch (e) {
    return fallback;
  }
}