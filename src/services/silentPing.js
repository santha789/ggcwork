import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://hrmggc.ggclinkgroup.com';
const FCM_TOKEN_KEY = '@ggcwork/fcm_token';
const EAS_PROJECT_ID = '401c38e2-72e5-494b-b241-0fbf1c63a3bf';

let _authHeaders = {};

export function setAuthHeaders(headers) {
  _authHeaders = headers || {};
}

async function ensureLocationPermission() {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Location.requestForegroundPermissionsAsync();
  return req.status === 'granted';
}

async function processSilentPing(extra = {}) {
  try {
    const granted = await ensureLocationPermission();
    if (!granted) {
      console.log('[SilentPing] Location permission denied');
      return;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
    });

    const isMock = position.mocked || false;
    const userId = extra.userId || null;
    const fcmToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);

    const body = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      is_mock: isMock,
      triggered_by: 'ping_on_demand',
      device_info: `${Device.modelName || Device.deviceName || 'unknown'} | ${Device.osName} ${Device.osVersion}`,
      fcm_token: fcmToken,
    };
    if (userId) body.user_id = userId;

    const cookieRaw = await AsyncStorage.getItem('@ggcwork/cookie-jar');
    const jar = cookieRaw ? JSON.parse(cookieRaw) : {};
    const cookies = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const xsrf = jar['XSRF-TOKEN'] ? decodeURIComponent(jar['XSRF-TOKEN']) : '';

    const res = await fetch(`${API_BASE}/api/v1/location/ping-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
        ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
        ..._authHeaders,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('[SilentPing] Response:', res.status, data?.message);
    return data;
  } catch (e) {
    console.log('[SilentPing] Error:', e.message);
  }
}

export async function initSilentPing(userId) {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync({ alert: false, badge: false, sound: false });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
  if (tokenData?.data) {
    await AsyncStorage.setItem(FCM_TOKEN_KEY, tokenData.data);
  }

  Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request?.content?.data;
    if (data?.action === 'PING_LOCATION') {
      console.log('[SilentPing] Foreground ping received');
      processSilentPing({ userId });
    }
  });

  const last = await Notifications.getLastNotificationResponseAsync();
  if (last?.notification?.request?.content?.data?.action === 'PING_LOCATION') {
    console.log('[SilentPing] Cold-start ping detected');
    processSilentPing({ userId });
  }

  console.log('[SilentPing] Initialized, userId:', userId);
}

export async function registerFcmTokenToServer(userId) {
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
  if (!tokenData?.data) return;

  await AsyncStorage.setItem(FCM_TOKEN_KEY, tokenData.data);

  try {
    const cookieRaw = await AsyncStorage.getItem('@ggcwork/cookie-jar');
    const jar = cookieRaw ? JSON.parse(cookieRaw) : {};
    const cookies = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const xsrf = jar['XSRF-TOKEN'] ? decodeURIComponent(jar['XSRF-TOKEN']) : '';

    await fetch(`${API_BASE}/api/v1/location/ping-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
        ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
        ..._authHeaders,
      },
      body: JSON.stringify({
        user_id: userId,
        fcm_token: tokenData.data,
        triggered_by: 'fcm_registration',
      }),
    });
  } catch (e) {
    console.log('[SilentPing] FCM registration error:', e.message);
  }
}
