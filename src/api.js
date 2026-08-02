const BASE = 'https://hrmggc.ggclinkgroup.com';

let jar = {};

function saveSetCookies(allHeaders) {
  if (!allHeaders) return;
  const lines = allHeaders.split(/\r?\n/);
  lines.forEach((line) => {
    const idx = line.indexOf(':');
    if (idx < 0) return;
    const name = line.slice(0, idx).trim().toLowerCase();
    if (name !== 'set-cookie') return;
    const value = line.slice(idx + 1).trim();
    const seg = value.split(';')[0];
    const eq = seg.indexOf('=');
    if (eq > 0) {
      const key = seg.slice(0, eq).trim();
      const val = seg.slice(eq + 1).trim();
      if (key) jar[key] = val;
    }
  });
}

function cookieHeader() {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function csrfToken() {
  if (jar['XSRF-TOKEN']) return decodeURIComponent(jar['XSRF-TOKEN']);
  return '';
}

function parseMetaToken(html) {
  const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  return m ? m[1] : '';
}

function clearJar() {
  jar = {};
}

function decodeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseDataPage(html) {
  const m = html.match(/data-page="((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    return JSON.parse(decodeHtml(m[1]));
  } catch (e) {
    return null;
  }
}

function request(method, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const attempt = (retry) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, BASE + path);
      xhr.setRequestHeader('Accept', 'application/json, text/html, */*');
      xhr.setRequestHeader('Content-Type', 'application/json');
      const cookies = cookieHeader();
      if (cookies) xhr.setRequestHeader('Cookie', cookies);
      const csrf = csrfToken();
      if (csrf) xhr.setRequestHeader('X-XSRF-TOKEN', csrf);
      if (extraHeaders) {
        Object.entries(extraHeaders).forEach(([k, v]) =>
          xhr.setRequestHeader(k, v)
        );
      }
      xhr.onload = () => {
        saveSetCookies(xhr.getAllResponseHeaders());
        resolve({
          status: xhr.status,
          text: xhr.responseText,
          headers: xhr.getAllResponseHeaders(),
        });
      };
      xhr.onerror = () => {
        if (retry > 0) {
          setTimeout(() => attempt(retry - 1), 1200);
        } else {
          reject(
            new Error(
              'Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
            )
          );
        }
      };
      xhr.timeout = 30000;
      xhr.ontimeout = () => {
        if (retry > 0) {
          setTimeout(() => attempt(retry - 1), 1200);
        } else {
          reject(
            new Error('Server terlalu lama merespons. Periksa koneksi, lalu coba lagi.')
          );
        }
      };
      xhr.send(body ? JSON.stringify(body) : null);
    };
    attempt(2);
  });
}

export async function login(email, password) {
  clearJar();
  const pre = await request('GET', '/login');
  if (pre.status === 419) {
    throw new Error('Server menolak (419). Coba buka kembali app-nya.');
  }

  const res = await request('POST', '/login', {
    email,
    password,
    remember: false,
  });

  let page = parseDataPage(res.text);
  if (!page && (res.status === 302 || res.status === 301)) {
    const dash = await request('GET', '/dashboard');
    page = parseDataPage(dash.text);
  }

  if (page && page.component === 'Dashboard') {
    return page.props;
  }

  // Masih di halaman login berarti gagal / validasi error.
  if (page && page.component === 'Auth/Login') {
    const errs = page.props?.errors || {};
    const flash = page.props?.flash || {};
    const msg =
      (errs.email && errs.email[0]) ||
      (errs.password && errs.password[0]) ||
      flash.error ||
      'Login gagal. Cek email dan password.';
    throw new Error(msg);
  }

  if (res.status === 419) {
    throw new Error('CSRF mismatch (419). Restart app lalu coba lagi.');
  }

  const snippet = (res.text || '').replace(/\s+/g, ' ').slice(0, 200);
  throw new Error(
    'Login gagal (status ' +
      res.status +
      '). Pastikan email lengkap & benar. Detail: ' +
      snippet
  );
}

export async function getPage(path) {
  const res = await request('GET', path);
  if (res.status === 419) {
    throw new Error('Sesi berakhir (419). Silakan keluar dan login ulang.');
  }
  if (res.status === 302 || res.status === 0) {
    throw new Error('Sesi berakhir. Silakan login ulang.');
  }
  const page = parseDataPage(res.text);
  if (!page) {
    throw new Error('Gagal membaca data dari server.');
  }
  return page.props;
}

export async function logout() {
  try {
    await request('POST', '/logout');
  } catch (e) {
    // ignore
  }
  clearJar();
}
