// expo-notifications: remote push dihapus dari Expo Go sejak SDK 53.
// Import statis akan crash saat module load (internal addPushTokenListener throws).
// Helper ini memuat modul secara dinamis + terlindungi, supaya app tetap
// berjalan di Expo Go (fitur notif push nonaktif), dan penuh di dev/prod build.

let _notifPromise = null;

export async function getNotif() {
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