export const SHIFTS = {
  1: 'Shift 1 NOC',
  2: 'Shift 2 NOC',
  3: 'Shift 3 NOC',
  4: 'Regular',
  7: 'Shift 1 Security',
  8: 'Shift 2 Security',
  9: 'Shift 1 PKL',
  10: 'Shift 2 PKL',
  11: 'Shift 3 PKL',
  14: '24jam',
  15: 'Shift 1 Warehouse',
  16: 'Shift 2 Warehouse',
  17: 'Shift 1 Service',
  18: 'Shift 2 Service',
  22: 'Shift Minggu NOC',
  23: 'Regular2',
  24: 'Regular3',
  25: 'Shift 1 PKL Wanita',
  26: 'Shift 2 PKL Wanita',
  27: 'Shift Harian Lepas',
  28: 'Shift 1 Staff Service',
  29: 'Shift 2 Staff Service',
  30: 'Shift 1 Cleaning Service',
  31: 'Shift 2 Cleaning Service',
  32: 'Shift 1 Sales Order',
  33: 'Shift 2 Sales Order',
  34: 'Regular Perempuan',
  35: 'Regular4',
  36: 'Shift Accounting',
  37: 'Shift Teknisi FTTH',
};

export function shiftName(id) {
  if (!id) return 'OFF';
  return SHIFTS[id] || 'Shift ' + id;
}

export function shiftShort(id) {
  if (!id) return 'OFF';
  const n = SHIFTS[id];
  if (!n) return 'S' + id;
  const m = n.match(/^Shift (\d+)/);
  if (m) return 'S' + m[1];
  const words = n.split(' ');
  if (words.length >= 2) return words.slice(0, 2).map((w) => w[0]).join('');
  return n.slice(0, 3);
}
