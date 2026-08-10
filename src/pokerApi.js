import { getStoredToken } from './attendanceApi';

const BASE = 'https://hrmggc.ggclinkgroup.com';

function jsonRequest(method, path, token) {
  return new Promise((resolve, reject) => {
    const attempt = (retry) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, BASE + path);
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          data = null;
        }
        resolve({ status: xhr.status, data });
      };
      xhr.onerror = () => {
        if (retry > 0) setTimeout(() => attempt(retry - 1), 1200);
        else reject(new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'));
      };
      xhr.timeout = 20000;
      xhr.ontimeout = () => {
        if (retry > 0) setTimeout(() => attempt(retry - 1), 1200);
        else reject(new Error('Server terlalu lama merespons.'));
      };
      xhr.send(null);
    };
    attempt(2);
  });
}

export async function pokerStatus() {
  const token = await getStoredToken();
  const res = await jsonRequest('GET', '/api/poker/status', token);
  if (res.status === 401 || res.status === 419) {
    throw new Error('Sesi berakhir. Silakan login ulang.');
  }
  return res.data || {};
}