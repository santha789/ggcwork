import { getStoredToken } from './attendanceApi';

const BASE = 'https://hrmggc.ggclinkgroup.com';

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
  const form = new FormData();
  const name = 'ht_' + Date.now() + '.' + (mimeType === 'audio/mp4' ? 'm4a' : 'webm');
  form.append('audio', { uri, name, type: mimeType || 'audio/m4a' });
  form.append('duration_ms', String(Math.round(durationMs || 0)));
  form.append('audience', JSON.stringify(audience));

  const res = await fetch(BASE + '/api/v1/ht/broadcast', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: form,
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
    throw new Error(
      data?.errors?.audio?.[0] || data?.message || 'Kirim SIARAN gagal (status ' + res.status + ').'
    );
  }
  return data.data;
}