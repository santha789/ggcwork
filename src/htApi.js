import { getStoredToken } from './attendanceApi';
import * as FileSystem from 'expo-file-system/legacy';

const BASE = 'https://hrmggc.ggclinkgroup.com';

export function htWsUrl() {
  return BASE.replace(/^https/, 'wss') + '/ws/ht';
}

async function withToken() {
  let token = null;
  try {
    token = await getStoredToken();
  } catch (e) {}
  return token;
}

async function json(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (res.status === 401) {
    const err = new Error('Sesi berakhir. Silakan login ulang.');
    err.unauthorized = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(data?.message || 'Gagal memuat data HT (status ' + res.status + ').');
  }
  return data;
}

export async function htOptions() {
  const token = await withToken();
  const res = await json('GET', '/api/v1/ht/options', null, token);
  return res.data;
}

export async function htSetEnabled(enabled) {
  const token = await withToken();
  const res = await json('POST', '/api/v1/ht/set-enabled', { enabled: !!enabled }, token);
  return res.data;
}

export async function htStream(afterId = 0) {
  const token = await withToken();
  const res = await json('GET', '/api/v1/ht/stream?after=' + (afterId || 0), null, token);
  return res.data;
}

export async function htBroadcast({ uri, mimeType, durationMs, audience }) {
  const token = await withToken();
  const cleanUri = uri.startsWith('file://') ? uri : 'file://' + uri;

  const res = await FileSystem.uploadAsync(BASE + '/api/v1/ht/broadcast', cleanUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'audio',
    mimeType: mimeType || 'audio/m4a',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    parameters: {
      duration_ms: String(Math.round(durationMs || 0)),
      audience: JSON.stringify(audience),
    },
  });

  let data = null;
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    data = null;
  }
  if (res.status === 401) {
    const err = new Error('Sesi berakhir. Silakan login ulang.');
    err.unauthorized = true;
    throw err;
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      data?.errors?.audio?.[0] || data?.message || 'Kirim SIARAN gagal (status ' + res.status + ').'
    );
  }
  return data?.data;
}
