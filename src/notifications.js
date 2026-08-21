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

function contractReminders(profile) {
  const list = [];
  if (!profile) return list;
  const today = startOfDay(new Date());

  const userProfile = profile.userProfile || profile;
  const contracts = userProfile.contracts || profile.contracts || [];
  const active = contracts.find((c) => c.status === 'active') || contracts[0];
  const endDate = active?.end_date || userProfile.end_date;
  if (!endDate) return list;

  const end = new Date(endDate + 'T00:00:00');
  const diff = daysBetween(today, end);
  const name = fullname(userProfile);

  if (diff === 30) {
    list.push({
      id: 'ctr-self-30',
      type: 'contract',
      title: 'Kontrakmu Habis 30 Hari Lagi',
      message: `Kontrak kamu (${active?.contract_number || '-'}) berakhir pada ${endDate}. Segera hubungi HR untuk tindak lanjut.`,
      day: 'H-30',
      daysLeft: diff,
      endDate,
    });
  } else if (diff === 7) {
    list.push({
      id: 'ctr-self-7',
      type: 'contract',
      title: 'Kontrakmu Habis 7 Hari Lagi',
      message: `Kontrak kamu berakhir pada ${endDate}. Segera koordinasikan perpanjangan dengan HR.`,
      day: 'H-7',
      daysLeft: diff,
      endDate,
    });
  } else if (diff === 1) {
    list.push({
      id: 'ctr-self-1',
      type: 'contract',
      title: 'Kontrakmu Habis Besok',
      message: `Kontrak kamu berakhir besok (${endDate}). Segera tindak lanjuti dengan HR.`,
      day: 'H-1',
      daysLeft: diff,
      endDate,
    });
  }
  return list;
}

function birthdayReminders(birthdayUsers) {
  const list = [];
  const today = startOfDay(new Date());

  (birthdayUsers || []).forEach((u) => {
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
  return list;
}

function curhatReminders(posts, myId, lastCurhatId) {
  const list = [];
  (posts || []).forEach((p) => {
    if (!p || p.user_id === myId) return;
    if (lastCurhatId && p.id <= lastCurhatId) return;
    list.push({
      id: 'curhat-' + p.id,
      type: 'curhat',
      title: 'Curhat Baru',
      message: `${fullname(p.user)} membagikan status baru: "${(p.content || '').slice(0, 60)}${(p.content || '').length > 60 ? '…' : ''}"`,
      day: 'Baru',
      post: p,
    });
  });
  return list;
}

function chatReminders(rooms, lastSeenChat) {
  const list = [];
  (rooms || []).forEach((r) => {
    const last = lastSeenChat ? lastSeenChat[r.id] : null;
    if (last && new Date(r.updated_at).getTime() <= new Date(last).getTime()) return;
    const partner = (r.users || []).find((u) => u.id !== undefined) || {};
    list.push({
      id: 'chat-' + r.id,
      type: 'chat',
      title: 'Pesan Baru',
      message: `Ada pesan baru dari ${fullname(partner)}. Buka Chat untuk membalas.`,
      day: 'Baru',
      room: r,
      partner,
    });
  });
  return list;
}

export function computeNotifications({ dashboard, profile, posts, rooms, lastSeen, myId }) {
  const list = [];
  const bdays = birthdayReminders(dashboard?.birthdayUsers);
  const contracts = contractReminders(profile);
  const curhats = curhatReminders(posts, myId, lastSeen?.curhatId);
  const chats = chatReminders(rooms, lastSeen?.chat);

  list.push(...bdays, ...contracts, ...curhats, ...chats);

  const order = { birthday: 1, contract: 2, curhat: 3, chat: 4 };
  return list.sort((a, b) => {
    if (a.type !== b.type) return order[a.type] - order[b.type];
    const ad = a.day === 'Hari ini' || a.day === 'Baru' ? 0 : parseInt(a.day.replace('H-', ''), 10) || 99;
    const bd = b.day === 'Hari ini' || b.day === 'Baru' ? 0 : parseInt(b.day.replace('H-', ''), 10) || 99;
    return ad - bd;
  });
}

export function unreadCounts({ posts, rooms, lastSeen, myId }) {
  const curhat = (posts || []).filter(
    (p) => p && p.user_id !== myId && (!lastSeen?.curhatId || p.id > lastSeen.curhatId)
  ).length;
  const chat = (rooms || []).filter(
    (r) =>
      !lastSeen?.chat?.[r.id] ||
      new Date(r.updated_at).getTime() > new Date(lastSeen.chat[r.id]).getTime()
  ).length;
  return { curhat, chat };
}

const NOTIF_HOUR = 8;

function atHour(day, hour, minute = 0) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function buildSchedules({ dashboard, profile }) {
  const out = [];
  const today = startOfDay(new Date());

  // Birthday notifications: only show in-app bell list, not as OS push
  // (OS push duplicates the in-app list and causes 3x notifications)

  const userProfile = profile?.userProfile || profile;
  const contracts = userProfile.contracts || profile?.contracts || [];
  const activeContract = contracts.find((c) => c.status === 'active') || contracts[0];
  const endDate = activeContract?.end_date || userProfile.end_date;
  if (endDate) {
    const end = new Date(endDate + 'T00:00:00');
    const name = fullname(userProfile);
    const target = atHour(end, NOTIF_HOUR);

    [
      [30, `Kontrak kamu berakhir dalam 30 hari lagi (${endDate}). Segera hubungi HR.`],
      [7, `Kontrak kamu berakhir dalam 7 hari lagi (${endDate}). Segera koordinasikan dengan HR.`],
      [1, `Kontrak kamu berakhir besok (${endDate}). Segera tindak lanjuti dengan HR.`],
    ].forEach(([off, message]) => {
      const at = atHour(new Date(end.getFullYear(), end.getMonth(), end.getDate() - off), NOTIF_HOUR);
      if (at.getTime() > Date.now()) {
        const title =
          off === 1
            ? 'Kontrak Habis Besok'
            : `Kontrak Habis ${off} Hari Lagi`;
        out.push({
          key: `ctr-self-${off}`,
          date: at,
          title,
          message,
          type: 'contract',
        });
      }
    });
  }

  // Performa bulanan: akhir bulan jam 22:30 WIB (bulan ini & berikutnya)
  const now = new Date();
  for (let i = 0; i < 2; i++) {
    const y = now.getFullYear();
    const m = now.getMonth() + i;
    const monthIndex = m % 12;
    const year = y + Math.floor(m / 12);
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const target = atHour(new Date(year, monthIndex, lastDay), 22, 30);
    if (target.getTime() > Date.now()) {
      out.push({
        key: `perf-${year}-${monthIndex + 1}`,
        date: target,
        title: '🏆 Karyawan Teladan Bulan Ini',
        message: 'Rekap performa bulan ini telah siap. Cek Karyawan Teladan & perhatian khusus absensi di menu Performa.',
        type: 'performance',
      });
    }
  }

  return out;
}
