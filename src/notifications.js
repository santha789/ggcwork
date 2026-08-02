function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function fullname(u) {
  if (!u) return 'Karyawan';
  return u.fullname || (u.firstname ? `${u.firstname} ${u.lastname || ''}`.trim() : 'Karyawan');
}

export function computeNotifications(props) {
  const list = [];
  const today = startOfDay(new Date());

  const birthdays = props.birthdayUsers || [];
  birthdays.forEach((u) => {
    if (!u.date_of_birth) return;
    const dob = new Date(u.date_of_birth + 'T00:00:00');
    const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    const diff = daysBetween(today, next);
    if (diff === 1) {
      list.push({
        id: 'bday-' + u.id + '-t',
        type: 'birthday',
        title: 'Ulang Tahun Besok',
        message: `${fullname(u)} merayakan ulang tahun besok. Jangan lupa ucapkan selamat!`,
        day: 'H-1',
        user: u,
      });
    } else if (diff === 0) {
      list.push({
        id: 'bday-' + u.id + '-h',
        type: 'birthday',
        title: 'Selamat Ulang Tahun 🎉',
        message: `${fullname(u)} berulang tahun hari ini. Kirimkan ucapan selamat!`,
        day: 'Hari ini',
        user: u,
      });
    }
  });

  const contracts = props.expiringContracts || [];
  contracts.forEach((c) => {
    if (!c.end_date) return;
    const end = new Date(c.end_date + 'T00:00:00');
    const diff = daysBetween(today, end);
    if (diff === 30) {
      list.push({
        id: 'ctr-' + c.id + '-30',
        type: 'contract',
        title: 'Kontrak Habis 30 Hari Lagi',
        message: `Kontrak ${fullname(c.user)} berakhir pada ${c.end_date}. Segera perpanjang atau evaluasi.`,
        day: 'H-30',
        user: c.user,
        contract: c,
      });
    } else if (diff === 7) {
      list.push({
        id: 'ctr-' + c.id + '-7',
        type: 'contract',
        title: 'Kontrak Habis 7 Hari Lagi',
        message: `Kontrak ${fullname(c.user)} berakhir pada ${c.end_date}. Perlu tindak lanjut segera.`,
        day: 'H-7',
        user: c.user,
        contract: c,
      });
    } else if (diff === 1) {
      list.push({
        id: 'ctr-' + c.id + '-1',
        type: 'contract',
        title: 'Kontrak Habis Besok',
        message: `Kontrak ${fullname(c.user)} berakhir besok (${c.end_date}). Ambil keputusan sekarang.`,
        day: 'H-1',
        user: c.user,
        contract: c,
      });
    }
  });

  const order = { birthday: 1, contract: 2 };
  return list.sort((a, b) => {
    if (a.type !== b.type) return order[a.type] - order[b.type];
    const ad = a.day === 'Hari ini' ? 0 : parseInt(a.day.replace('H-', ''), 10);
    const bd = b.day === 'Hari ini' ? 0 : parseInt(b.day.replace('H-', ''), 10);
    return ad - bd;
  });
}

const NOTIF_HOUR = 8;

function atHour(day, hour) {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function buildSchedules(props) {
  const out = [];
  const today = startOfDay(new Date());

  const birthdays = props.birthdayUsers || [];
  birthdays.forEach((u) => {
    if (!u.date_of_birth) return;
    const dob = new Date(u.date_of_birth + 'T00:00:00');
    const bday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    const name = fullname(u);

    const h1 = atHour(new Date(bday.getFullYear(), bday.getMonth(), bday.getDate() - 1), NOTIF_HOUR);
    if (h1.getTime() > Date.now()) {
      out.push({
        key: `bday-${u.id}-H1`,
        date: h1,
        title: 'Ulang Tahun Besok 🎂',
        message: `${name} merayakan ulang tahun besok. Jangan lupa ucapkan selamat!`,
        type: 'birthday',
      });
    }

    const h = atHour(bday, NOTIF_HOUR);
    if (h.getTime() > Date.now()) {
      out.push({
        key: `bday-${u.id}-H`,
        date: h,
        title: 'Selamat Ulang Tahun 🎉',
        message: `${name} berulang tahun hari ini. Kirimkan ucapan selamat!`,
        type: 'birthday',
      });
    }
  });

  const contracts = props.expiringContracts || [];
  contracts.forEach((c) => {
    if (!c.end_date) return;
    const end = new Date(c.end_date + 'T00:00:00');
    const name = fullname(c.user);
    const target = atHour(end, NOTIF_HOUR);

    [
      [30, `Kontrak ${name} berakhir dalam 30 hari lagi (${c.end_date}). Segera perpanjang atau evaluasi.`],
      [7, `Kontrak ${name} berakhir dalam 7 hari lagi (${c.end_date}). Perlu tindak lanjut segera.`],
      [1, `Kontrak ${name} berakhir besok (${c.end_date}). Ambil keputusan sekarang.`],
    ].forEach(([off, message]) => {
      const at = atHour(new Date(end.getFullYear(), end.getMonth(), end.getDate() - off), NOTIF_HOUR);
      if (at.getTime() > Date.now()) {
        const title =
          off === 1
            ? 'Kontrak Habis Besok'
            : `Kontrak Habis ${off} Hari Lagi`;
        out.push({
          key: `ctr-${c.id}-${off}`,
          date: at,
          title,
          message,
          type: 'contract',
        });
      }
    });
  });

  return out;
}
