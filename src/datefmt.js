const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
const WEEKDAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v;
  }
  let d;
  if (typeof v === 'number') {
    d = new Date(v);
  } else if (typeof v === 'string') {
    const s = String(v).trim();
    d = new Date(s);
    if (isNaN(d.getTime())) {
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (m) {
        d = new Date(
          +m[1], +m[2] - 1, +m[3],
          +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)
        );
      } else {
        d = new Date(NaN);
      }
    }
  } else {
    return null;
  }
  return isNaN(d && d.getTime()) ? null : d;
}

const p2 = (n) => String(n).padStart(2, '0');

export function fmtTime(v) {
  const d = parseDate(v);
  if (!d) return '';
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

export function fmtTimeSeconds(v) {
  const d = parseDate(v);
  if (!d) return '';
  return (
    p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds())
  );
}

export function fmtDate(v, opts = {}) {
  const d = parseDate(v);
  if (!d) return opts.fallback || '';
  const weekday = opts.weekday;
  const month = opts.month || 'long';
  const withYear = opts.year !== false;
  const parts = [];
  if (weekday === 'long') parts.push(WEEKDAYS_LONG[d.getDay()]);
  else if (weekday === 'short') parts.push(WEEKDAYS_SHORT[d.getDay()]);
  parts.push(d.getDate());
  parts.push(month === 'short' ? MONTHS_SHORT[d.getMonth()] : MONTHS_LONG[d.getMonth()]);
  if (withYear) parts.push(d.getFullYear());
  return parts.join(' ');
}

export function fmtRp(v) {
  const n = Number(v);
  if (!isFinite(n)) return '-';
  const neg = n < 0;
  const abs = Math.abs(n);
  let body;
  if (Number.isInteger(abs)) {
    body = String(abs);
  } else {
    body = abs.toFixed(2).replace(/0+$/, '').replace(/[,.]$/, '');
  }
  const [int, dec] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const tail = dec ? ',' + dec : '';
  return (neg ? '-Rp ' : 'Rp ') + grouped + tail;
}