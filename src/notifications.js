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

function checkoutReminders({ attendanceToday, shift }) {
  const list = [];
  if (!shift?.end_time) return list;

  const attendance = attendanceToday?.attendance;
  const hasIn = !!attendance?.clock_in;
  const hasOut = !!attendance?.clock_out;

  // Only remind if already clocked in but hasn't clocked out
  if (!hasIn || hasOut) return list;

  const now = new Date();
  const [endHour, endMin] = shift.end_time.split(':').map(Number);
  const endTimeMin = endHour * 60 + (endMin || 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 1 hour before checkout (H-60 min)
  const reminderStartMin = endTimeMin - 60;

  if (nowMin >= reminderStartMin && nowMin < endTimeMin) {
    list.push({
      id: 'checkout-reminder-1h',
      type: 'checkout',
      title: '⏰ 1 Jam Menuju Waktu Pulang',
      message: `Shift kerja Anda berakhir pukul ${shift.end_time.slice(0, 5)} WIB. Bersiaplah untuk melakukan presensi pulang nanti.`,
      day: 'Hari ini',
      shift,
    });
  } else if (nowMin >= endTimeMin) {
    list.push({
      id: 'checkout-reminder-now',
      type: 'checkout',
      title: '🏢 Waktu Presensi Pulang Telah Tiba',
      message: `Jam kerja shift Anda (${shift.end_time.slice(0, 5)} WIB) sudah selesai. Jangan lupa lakukan absen pulang sekarang.`,
      day: 'Hari ini',
      shift,
    });
  }

  return list;
}

function announcementReminders(announcements, myId, seenAnnouncementIds) {
  const list = [];
  const seenSet = new Set(seenAnnouncementIds || []);

  (announcements || []).forEach((a) => {
    if (!a || !a.id) return;
    if (a.is_read || seenSet.has('announcement-' + a.id)) return;

    list.push({
      id: 'announcement-' + a.id,
      type: 'announcement',
      title: '📜 Surat Pengumuman Resmi',
      message: `${a.title} (${a.document_number || 'Official'}). Buka untuk membaca rincian surat.`,
      day: 'Baru',
      announcement: a,
    });
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
      title: p.type === 'announcement' ? '📢 Pengumuman Feed' : 'Curhat Baru',
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

export function computeNotifications({
  dashboard,
  profile,
  posts,
  rooms,
  announcements,
  attendanceToday,
  shift,
  lastSeen,
  myId,
}) {
  const list = [];
  const bdays = birthdayReminders(dashboard?.birthdayUsers);
  const contracts = contractReminders(profile);
  const curhats = curhatReminders(posts, myId, lastSeen?.curhatId);
  const chats = chatReminders(rooms, lastSeen?.chat);
  const checkouts = checkoutReminders({
    attendanceToday: attendanceToday || dashboard?.today,
    shift: shift || dashboard?.today?.shift || dashboard?.shift,
  });
  const annots = announcementReminders(
    announcements || dashboard?.announcements,
    myId,
    lastSeen?.seen
  );

  list.push(...checkouts, ...annots, ...bdays, ...contracts, ...curhats, ...chats);

  const order = { checkout: 0, announcement: 1, birthday: 2, contract: 3, curhat: 4, chat: 5 };
  return list.sort((a, b) => {
    if (a.type !== b.type) return (order[a.type] || 99) - (order[b.type] || 99);
    const ad = a.day === 'Hari ini' || a.day === 'Baru' ? 0 : parseInt(a.day.replace('H-', ''), 10) || 99;
    const bd = b.day === 'Hari ini' || b.day === 'Baru' ? 0 : parseInt(b.day.replace('H-', ''), 10) || 99;
    return ad - bd;
  });
}

export function unreadCounts({ posts, rooms, announcements, lastSeen, myId }) {
  const curhat = (posts || []).filter(
    (p) => p && p.user_id !== myId && (!lastSeen?.curhatId || p.id > lastSeen.curhatId)
  ).length;
  const chat = (rooms || []).filter(
    (r) =>
      !lastSeen?.chat?.[r.id] ||
      new Date(r.updated_at).getTime() > new Date(lastSeen.chat[r.id]).getTime()
  ).length;
  const announcementCount = (announcements || []).filter(
    (a) => a && !a.is_read
  ).length;
  return { curhat, chat, announcement: announcementCount };
}

const NOTIF_HOUR = 8;

function atHour(day, hour, minute = 0) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function buildSchedules({ dashboard, profile, attendanceToday, shift }) {
  const out = [];
  const today = startOfDay(new Date());

  // 1. Pengingat Absen Pulang (1 jam sebelum pulang & saat jam pulang)
  const currentShift = shift || attendanceToday?.shift || dashboard?.today?.shift;
  const attendance = attendanceToday?.attendance || dashboard?.today?.attendance;
  const hasIn = !!attendance?.clock_in;
  const hasOut = !!attendance?.clock_out;

  if (currentShift?.end_time && hasIn && !hasOut) {
    const [endHour, endMin] = currentShift.end_time.split(':').map(Number);
    const now = new Date();
    
    // H-1 jam sebelum pulang
    const oneHourBefore = new Date();
    oneHourBefore.setHours(endHour - 1, endMin || 0, 0, 0);
    if (oneHourBefore.getTime() > now.getTime()) {
      out.push({
        key: `checkout-remind-1h-${today.toISOString().slice(0, 10)}`,
        date: oneHourBefore,
        title: '⏰ 1 Jam Menuju Waktu Pulang',
        message: `Shift kerja Anda berakhir pukul ${currentShift.end_time.slice(0, 5)} WIB. Siap-siap untuk absen pulang!`,
        type: 'checkout',
      });
    }

    // Tepat jam pulang
    const exactCheckout = new Date();
    exactCheckout.setHours(endHour, endMin || 0, 0, 0);
    if (exactCheckout.getTime() > now.getTime()) {
      out.push({
        key: `checkout-remind-now-${today.toISOString().slice(0, 10)}`,
        date: exactCheckout,
        title: '🏢 Waktu Pulang Kerja Telah Tiba',
        message: `Jam kerja shift Anda (${currentShift.end_time.slice(0, 5)} WIB) sudah selesai. Jangan lupa absen pulang di GGC Work.`,
        type: 'checkout',
      });
    }

    // 30 menit setelah jam pulang (bila belum absen)
    const thirtyMinAfter = new Date();
    thirtyMinAfter.setHours(endHour, (endMin || 0) + 30, 0, 0);
    if (thirtyMinAfter.getTime() > now.getTime()) {
      out.push({
        key: `checkout-remind-after-${today.toISOString().slice(0, 10)}`,
        date: thirtyMinAfter,
        title: '⚠️ Pengingat Presensi Pulang',
        message: `Anda belum melakukan presensi pulang hari ini. Buka GGC Work sekarang untuk melakukan absen pulang.`,
        type: 'checkout',
      });
    }
  }

  // 2. Pengingat Kontrak Kerja
  const userProfile = profile?.userProfile || profile;
  const contracts = userProfile.contracts || profile?.contracts || [];
  const activeContract = contracts.find((c) => c.status === 'active') || contracts[0];
  const endDate = activeContract?.end_date || userProfile.end_date;
  if (endDate) {
    const end = new Date(endDate + 'T00:00:00');
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

  // 3. Performa bulanan
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
