export const colors = {
  bg: '#0b1120',
  card: '#151d31',
  cardAlt: '#1e2a44',
  border: '#2a3a5e',
  text: '#eef2ff',
  muted: '#8fa0c0',
  accent: '#2563eb',
  accentLight: '#60a5fa',
  indigo: '#4f46e5',
  emerald: '#10b981',
  green: '#34d399',
  yellow: '#fbbf24',
  red: '#f87171',
  purple: '#a78bfa',
  pink: '#f472b6',
};

export const APP_VERSION = '1.0.0';

export function fmtMoney(v) {
  const n = Number(v);
  if (isNaN(n)) return '-';
  return 'Rp ' + n.toLocaleString('id-ID');
}
