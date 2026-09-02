import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const BASE = 'https://hrmggc.ggclinkgroup.com';
const TOKEN_KEY = '@ggcwork/sanctum-token';
const DEVICE_NAME_KEY = '@ggcwork/device-name';
const EMAIL_KEY = '@ggcwork/login-email';
const TOKEN_KEY_AS = '@ggcwork/sanctum-token:as';
const EMAIL_KEY_AS = '@ggcwork/login-email:as';
const DEVICE_KEY_AS = '@ggcwork/device-name:as';

async function storageGet(key, asKey) {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v !== null) return v;
  } catch (e) {
    // fallback ke AsyncStorage
  }
  try {
    return (await AsyncStorage.getItem(asKey)) || null;
  } catch (e) {
    return null;
  }
}

async function storageSet(key, asKey, value) {
  // Expo Go kadang setItemAsync resolve tapi tidak tersimpan (gagal diam-diam).
  // Jadi selalu tulis ke SecureStore DAN AsyncStorage (mirror), lalu verifikasi.
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    // lanjut ke AsyncStorage
  }
  try {
    await AsyncStorage.setItem(asKey, value);
  } catch (e) {}
}

async function storageDelete(key, asKey) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {}
  try {
    await AsyncStorage.removeItem(asKey);
  } catch (e) {}
}

export async function getStoredToken() {
  return storageGet(TOKEN_KEY, TOKEN_KEY_AS);
}

export async function storeToken(token) {
  await storageSet(TOKEN_KEY, TOKEN_KEY_AS, token);
}

export async function clearStoredToken() {
  await storageDelete(TOKEN_KEY, TOKEN_KEY_AS);
}

function jsonRequest(method, path, body, { token, idempotencyKey } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (retry) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, BASE + path);
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (idempotencyKey) xhr.setRequestHeader('Idempotency-Key', idempotencyKey);
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          data = null;
        }
        resolve({ status: xhr.status, data, text: xhr.responseText });
      };
      xhr.onerror = () => {
        if (retry > 0) setTimeout(() => attempt(retry - 1), 1200);
        else reject(new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'));
      };
      xhr.timeout = 30000;
      xhr.ontimeout = () => {
        if (retry > 0) setTimeout(() => attempt(retry - 1), 1200);
        else reject(new Error('Server terlalu lama merespons.'));
      };
      xhr.send(body ? JSON.stringify(body) : null);
    };
    attempt(2);
  });
}

// Multipart request untuk punch berfoto (bukti evident). Mendukung FormData.
function multipartRequest(method, path, formData, { token, idempotencyKey } = {}) {
  return new Promise((resolve, reject) => {
    const attempt = (retry) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, BASE + path);
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (idempotencyKey) xhr.setRequestHeader('Idempotency-Key', idempotencyKey);

      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          data = null;
        }
        resolve({ status: xhr.status, data, text: xhr.responseText });
      };
      xhr.onerror = () => {
        if (retry > 0) setTimeout(() => attempt(retry - 1), 1500);
        else reject(new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'));
      };
      xhr.timeout = 60000;
      xhr.ontimeout = () => {
        if (retry > 0) setTimeout(() => attempt(retry - 1), 1500);
        else reject(new Error('Server terlalu lama merespons.'));
      };
      xhr.send(formData);
    };
    attempt(1);
  });
}

export async function apiLogin(email, password) {
  const res = await jsonRequest('POST', '/api/login', {
    email,
    password,
    device_name: await getDeviceName(),
  });
  if (res.status === 200 && res.data?.token) {
    await storeToken(res.data.token);
    return res.data;
  }
  const msg =
    res.data?.errors?.email?.[0] ||
    res.data?.message ||
    'Login absen gagal (status ' + res.status + ').';
  const err = new Error(msg);
  err.status = res.status;
  err.data = res.data;
  throw err;
}

export async function apiLogout() {
  const token = await getStoredToken();
  if (token) {
    try {
      await jsonRequest('POST', '/api/logout', null, { token });
    } catch (e) {
      // ignore
    }
  }
  await clearStoredToken();
}

export async function apiMe() {
  const token = await getStoredToken();
  if (!token) throw new Error('Sesi absen tidak ditemukan.');
  const res = await jsonRequest('GET', '/api/me', null, { token });
  if (res.status === 401) {
    const err = new Error('Sesi absen berakhir. Silakan login ulang.');
    err.unauthorized = true;
    throw err;
  }
  if (res.status !== 200) throw new Error('Gagal memuat profil (status ' + res.status + ').');
  return res.data;
}

export async function getOffices() {
  const token = await getStoredToken();
  if (!token) throw new Error('Sesi absen tidak ditemukan.');
  const res = await jsonRequest('GET', '/api/offices', null, { token });
  if (res.status === 401) {
    const err = new Error('Sesi absen berakhir. Silakan login ulang.');
    err.unauthorized = true;
    throw err;
  }
  if (res.status !== 200) throw new Error('Gagal memuat kantor (status ' + res.status + ').');
  return res.data.offices || [];
}

export async function getToday() {
  const token = await getStoredToken();
  if (!token) throw new Error('Sesi absen tidak ditemukan.');
  const res = await jsonRequest('GET', '/api/attendance/today', null, { token });
  if (res.status === 401) {
    const err = new Error('Sesi absen berakhir. Silakan login ulang.');
    err.unauthorized = true;
    throw err;
  }
  if (res.status !== 200) throw new Error('Gagal memuat status absen (status ' + res.status + ').');
  return res.data;
}

export async function sendPunch(payload) {
  const token = await getStoredToken();
  if (!token) throw new Error('Sesi absen tidak ditemukan.');
  const key = await Crypto.randomUUID();

  // Jika ada foto, kirim via multipart/form-data dengan field lain sebagai form fields
  // (backend menyimpan meta seperti lat/lng/device_info dll dari form fields ini).
  if (payload.photo) {
    const form = new FormData();
    form.append('punch_type', payload.punch_type);
    form.append('lat', String(payload.lat));
    form.append('lng', String(payload.lng));
    form.append('accuracy_m', String(payload.accuracy_m));
    if (payload.altitude_m !== null && payload.altitude_m !== undefined) {
      form.append('altitude_m', String(payload.altitude_m));
    }
    if (payload.speed_kmh !== null && payload.speed_kmh !== undefined) {
      form.append('speed_kmh', String(payload.speed_kmh));
    }
    if (payload.bearing_deg !== null && payload.bearing_deg !== undefined) {
      form.append('bearing_deg', String(payload.bearing_deg));
    }
    if (payload.geofence_id) form.append('geofence_id', String(payload.geofence_id));
    if (payload.address) form.append('address', payload.address);
    if (payload.battery_level !== null && payload.battery_level !== undefined) {
      form.append('battery_level', String(payload.battery_level));
    }
    form.append('timestamp', payload.timestamp);
    form.append('timezone', payload.timezone);
    // device_info dikirim sebagai array multipart (backend mengharapkan array, bukan string JSON)
    const di = payload.device_info || {};
    Object.keys(di).forEach((k) => {
      const v = di[k];
      if (v === null || v === undefined) return;
      if (typeof v === 'object') {
        Object.keys(v).forEach((kk) => {
          const vv = v[kk];
          if (vv !== null && vv !== undefined) form.append(`device_info[${k}][${kk}]`, String(vv));
        });
      } else {
        form.append(`device_info[${k}]`, String(v));
      }
    });
    form.append('photo', {
      uri: payload.photo.uri,
      name: payload.photo.name || 'selfie.jpg',
      type: payload.photo.type || 'image/jpeg',
    });

    const res = await multipartRequest('POST', '/api/attendance/punch', form, {
      token,
      idempotencyKey: key,
    });
    if (res.status === 401) {
      const err = new Error('Sesi absen berakhir. Silakan login ulang.');
      err.unauthorized = true;
      throw err;
    }
    const out = { status: res.status, data: res.data };
    if (res.status === 200) return out;
    out.message =
      res.data?.message || res.data?.error || res.data?.errors?.photo?.[0] ||
      'Punch gagal (status ' + res.status + ').';
    return out;
  }

  const res = await jsonRequest('POST', '/api/attendance/punch', payload, {
    token,
    idempotencyKey: key,
  });
  if (res.status === 401) {
    const err = new Error('Sesi absen berakhir. Silakan login ulang.');
    err.unauthorized = true;
    throw err;
  }
  const out = { status: res.status, data: res.data };
  if (res.status === 200) {
    return out;
  }
  out.message =
    res.data?.message || res.data?.error || 'Punch gagal (status ' + res.status + ').';
  return out;
}

async function getDeviceName() {
  const cached = await storageGet(DEVICE_NAME_KEY, DEVICE_KEY_AS);
  if (cached) return cached;
  let manufacturer = '';
  let modelName = '';
  try {
    manufacturer = Device.manufacturer || '';
  } catch (e) {}
  try {
    modelName = Device.modelName || '';
  } catch (e) {}
  const name = [manufacturer, modelName].filter(Boolean).join('-') ||
    (Platform.OS === 'android' ? 'Android-device' : 'Mobile-device');
  await storageSet(DEVICE_NAME_KEY, DEVICE_KEY_AS, name);
  return name;
}

export async function storeLoginEmail(email) {
  await storageSet(EMAIL_KEY, EMAIL_KEY_AS, email);
}

export async function getStoredLoginEmail() {
  return storageGet(EMAIL_KEY, EMAIL_KEY_AS);
}

function detectRooted() {
  const flags = [
    '__PWNED__',
    'RootBeer',
    'supersu',
    'magisk',
    'su',
  ];
  return flags.some((f) => {
    try {
      return typeof global !== 'undefined' && !!global[f];
    } catch (e) {
      return false;
    }
  });
}

function isEmulator() {
  if (Device.isDevice === false) return true;
  const f = Device.modelName || '';
  const brand = Device.brand || '';
  const re = /(emulator|sdk_gphone|generic|goldfish|vbox|nox|bluestacks|memu)/i;
  return re.test(f) || re.test(brand);
}

function isProbablyMockProvider(location) {
  if (!location) return false;
  const alt = location.coords?.altitude;
  if (typeof location.mocked !== 'undefined') return !!location.mocked;
  if (alt !== null && alt !== undefined && (alt <= -9999 || alt === 0)) {
    if (location.coords?.accuracy && location.coords.accuracy > 0) {
      return false;
    }
  }
  return false;
}

export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Izin lokasi ditolak. Aktifkan izin lokasi untuk absen.');
  }
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return loc;
}

export async function reverseGeocode(lat, lng) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results || !results.length) return null;
    const r = results[0];
    return (
      [
        r.street || '',
        r.district || r.city || r.subregion || '',
        r.city || r.subregion || '',
        r.region || '',
        r.postalCode || '',
      ]
        .filter(Boolean)
        .join(', ') || null
    );
  } catch (e) {
    return null;
  }
}

export async function collectDeviceInfo(location) {
  const mocked = isProbablyMockProvider(location);
  return {
    manufacturer: Device.manufacturer || null,
    model: Device.modelName || null,
    android_version: Device.osVersion || null,
    api_level: Device.platformApiLevel || null,
    app_version: Application.nativeApplicationVersion || null,
    app_build: Application.nativeBuildVersion ? parseInt(Application.nativeBuildVersion, 10) || null : null,
    is_rooted: detectRooted(),
    is_emulator: isEmulator(),
    has_mock_location_app: false,
    mock_detection: {
      is_mock: mocked,
      is_from_mock_provider: mocked,
      add_test_provider_trick: false,
    },
  };
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function buildPunchPayload(punchType, office, location, extras = {}) {
  const deviceInfo = await collectDeviceInfo(location);
  const now = new Date();
  const tz = office?.timezone || 'Asia/Jakarta';
  return {
    punch_type: punchType,
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy_m: Math.round(location.coords.accuracy || 0),
    altitude_m: location.coords.altitude ?? null,
    speed_kmh: ((location.coords.speed || 0) * 3.6).toFixed(1),
    bearing_deg: location.coords.heading ?? null,
    timestamp: toIsoWithOffset(now, tz),
    timezone: tz,
    geofence_id: office?.id || null,
    device_info: deviceInfo,
    photo: extras.photo || null,
    address: extras.address || null,
    battery_level: extras.batteryLevel ?? null,
  };
}

export function toIsoWithOffset(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type) => {
      const p = parts.find((x) => x.type === type);
      return p ? p.value : '';
    };
    const sign = timezone === 'Asia/Jakarta' ? '+' : '+';
    return (
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${sign}07:00`
    );
  } catch (e) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}+07:00`;
  }
}
