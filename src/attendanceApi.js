import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const BASE = 'https://hrmggc.ggclinkgroup.com';
const TOKEN_KEY = '@ggcwork/sanctum-token';
const DEVICE_NAME_KEY = '@ggcwork/device-name';

export async function getStoredToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export async function storeToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    // ignore
  }
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
  const cached = await SecureStore.getItemAsync(DEVICE_NAME_KEY);
  if (cached) return cached;
  const name =
    [Device.manufacturer, Device.modelName].filter(Boolean).join('-') ||
    (Platform.OS === 'android' ? 'Android-' + (Device.modelName || 'device') : 'Mobile-' + (Device.modelName || 'device'));
  await SecureStore.setItemAsync(DEVICE_NAME_KEY, name);
  return name;
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

export async function buildPunchPayload(punchType, office, location) {
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
