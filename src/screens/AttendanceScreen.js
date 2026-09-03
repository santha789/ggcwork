import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getPage } from '../api';
import { MaterialIcons } from '@expo/vector-icons';
import { Loading, Error } from '../components';
import { colors } from '../theme';

function monthName(m) {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return names[(m || 1) - 1] || m;
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function fmtTime(t) {
  if (!t) return '-';
  return t.slice(0, 5);
}

function getDeviceType(att) {
  if (!att) return null;
  const inDev = att.clock_in_device;
  const outDev = att.clock_out_device;

  if (!att.clock_in && !att.clock_out && !['Hadir', 'Telat', 'TAM', 'TAP'].includes(att.status)) {
    return null;
  }

  const isBioIn = inDev && inDev !== 'app';
  const isBioOut = outDev && outDev !== 'app';
  const isAppIn = inDev === 'app';
  const isAppOut = outDev === 'app';

  if ((isBioIn && isAppOut) || (isAppIn && isBioOut)) {
    return 'both';
  }
  if (isBioIn || isBioOut) {
    return 'biocloud';
  }
  if (isAppIn || isAppOut) {
    return 'app';
  }
  if (att.clock_in || att.clock_out || ['Hadir', 'Telat', 'TAM', 'TAP'].includes(att.status)) {
    return 'biocloud';
  }
  return null;
}

// Ikuti logika Summary.vue web: label + warna + title + deviceType per hari.
function getCellData(date, roster, att) {
  const isRosterDayOff = !!roster && (roster.is_day_off || !roster.shift_id);
  const deviceType = getDeviceType(att);
  const devText =
    deviceType === 'both'
      ? `🔵 Masuk: ${att?.clock_in_device === 'app' ? 'Aplikasi' : 'BioCloud'} | ⚪ Pulang: ${att?.clock_out_device === 'app' ? 'Aplikasi' : 'BioCloud'}`
      : deviceType === 'biocloud'
      ? '🔵 Mesin BioCloud'
      : deviceType === 'app'
      ? '⚪ Aplikasi Mobile'
      : '';

  if (isRosterDayOff) {
    if (att && (att.status === 'Hadir' || att.status === 'Telat' || att.status === 'TAM' || att.status === 'TAP')) {
      return {
        label: 'T',
        color: colors.green,
        bg: colors.green + '26',
        title: `Masuk / Tukar Shift (Masuk: ${fmtTime(att.clock_in)})`,
        att,
        deviceType,
        devText,
      };
    }
    if (att && (att.status === 'Izin' || att.status === 'Sakit')) {
      return {
        label: att.status === 'Izin' ? 'I' : 'S',
        color: colors.purple,
        bg: colors.purple + '26',
        title: `${att.status}${att.notes ? ' - ' + att.notes : ''}`,
        att,
        deviceType: null,
        devText: '',
      };
    }
    return { label: 'L', color: colors.muted, bg: colors.border + '66', title: 'Libur Roster (OFF)', att, deviceType: null, devText: '' };
  }

  if (att) {
    if (att.status === 'Hadir') {
      return { label: 'T', color: colors.green, bg: colors.green + '26', title: `Hadir (Masuk: ${fmtTime(att.clock_in)})`, att, deviceType, devText };
    }
    if (att.status === 'Telat') {
      return { label: 'T', color: colors.yellow, bg: colors.yellow + '26', title: `Telat (${att.late_minutes || 0} menit, Masuk: ${fmtTime(att.clock_in)})`, att, deviceType, devText };
    }
    if (att.status === 'TAM' || att.status === 'TAP') {
      return { label: 'T', color: colors.accentLight, bg: colors.accentLight + '26', title: `${att.status} (Masuk: ${fmtTime(att.clock_in)}, Pulang: ${fmtTime(att.clock_out)})`, att, deviceType, devText };
    }
    if (att.status === 'Alpha') {
      return { label: 'X', color: colors.red, bg: colors.red + '26', title: 'Alpha / Tidak Absen Pada Hari Kerja', att, deviceType: null, devText: '' };
    }
    if (att.status === 'Izin' || att.status === 'Sakit') {
      return { label: att.status === 'Izin' ? 'I' : 'S', color: colors.purple, bg: colors.purple + '26', title: `${att.status}${att.notes ? ' - ' + att.notes : ''}`, att, deviceType: null, devText: '' };
    }
    if (att.status === 'Libur') {
      return { label: 'L', color: colors.muted, bg: colors.border + '66', title: `Libur${att.notes ? ': ' + att.notes : ''}`, att, deviceType: null, devText: '' };
    }
    if (att.clock_in || att.clock_out) {
      return { label: 'T', color: colors.green, bg: colors.green + '26', title: `Masuk / Tap Presensi (Masuk: ${fmtTime(att.clock_in)})`, att, deviceType, devText };
    }
  }

  if (date <= todayStr()) {
    return { label: 'X', color: colors.red, bg: colors.red + '26', title: 'Alpha / Tidak Absen Pada Hari Kerja', att: null, deviceType: null, devText: '' };
  }

  return { label: '-', color: colors.muted, bg: colors.cardAlt, title: 'Mendatang', att: null, deviceType: null, devText: '' };
}

function computeStats(days) {
  const today = todayStr();
  let hadir = 0;
  let telat = 0;
  let alpha = 0;
  let cuti = 0;
  days.forEach((d) => {
    if (d.date > today) return;
    const cell = getCellData(d.date, d.roster, d.attendance);
    if (d.date === today && !d.attendance) return;
    if (d.is_day_off) return;
    if (cell.label === 'T') hadir += 1;
    if (cell.label === 'X') alpha += 1;
    if (cell.label === 'I' || cell.label === 'S') cuti += 1;
    if ((d.attendance?.late_minutes || 0) > 0) telat += 1;
  });
  return { hadir, telat, alpha, cuti };
}

export default function AttendanceScreen({ user, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  const load = useCallback(
    async (m, y) => {
      try {
        const props = await getPage(`/attendance/summary?month=${m}&year=${y}`);
        setData(props);
        setError('');
      } catch (e) {
        setError(e.message);
      }
    },
    []
  );

  useEffect(() => {
    load(viewMonth, viewYear);
  }, [load, viewMonth, viewYear]);

  async function refresh() {
    setRefreshing(true);
    await load(viewMonth, viewYear);
    setRefreshing(false);
  }

  function goMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const isFuture = viewYear > new Date().getFullYear() ||
    (viewYear === new Date().getFullYear() && viewMonth > new Date().getMonth() + 1);

  if (error) return <Error message={error} onRetry={() => load(viewMonth, viewYear)} />;
  if (!data) return <Loading />;

  const users = data.users || [];
  const attendances = data.attendances || {};
  const rosters = data.rosters || {};

  const myId = user?.id;
  const myUsers = myId
    ? users.filter((u) => String(u.id) === String(myId))
    : users;

  const rows = myUsers.map((u) => {
    const attByDate = {};
    (attendances[String(u.id)] || []).forEach((a) => {
      attByDate[a.date] = a;
    });
    const rosterByDate = {};
    (rosters[String(u.id)] || []).forEach((r) => {
      rosterByDate[r.date] = r;
    });
    const days = [];
    for (let d = 1; d <= (data.daysInMonth || 31); d++) {
      const date = `${data.year}-${String(data.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const roster = rosterByDate[date] || null;
      const att = attByDate[date] || null;
      days.push({
        date,
        roster,
        attendance: att,
        is_day_off: !!(roster && (roster.is_day_off || !roster.shift_id)),
      });
    }
    const stats = computeStats(days);
    return {
      id: u.id,
      fullname: `${u.firstname || ''} ${u.lastname || ''}`.trim() || 'Karyawan',
      employee_id: u.employee_id,
      position: u.position?.name || '',
      division: u.division?.name || '',
      sub_division: u.sub_division?.name || '',
      stats,
      days,
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.monthBar}>
        {onBack ? (
          <TouchableOpacity style={styles.monthBtn} onPress={onBack}>
            <MaterialIcons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.monthBtn} onPress={() => goMonth(-1)}>
            <MaterialIcons name="chevron-left" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <View style={styles.monthCenter}>
          <Text style={styles.title}>
            {monthName(data.month)} {data.year}
          </Text>
          <Text style={styles.subtitle}>
            {data.daysInMonth} hari{isFuture ? '' : ' · sesuai roster'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.monthBtn, isFuture && styles.monthBtnDisabled]}
          onPress={() => goMonth(1)}
          disabled={isFuture}
        >
          <MaterialIcons name="chevron-right" size={22} color={isFuture ? colors.muted : colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        renderItem={({ item }) => <EmployeeAttendance row={item} />}
      />
    </View>
  );
}

function EmployeeAttendance({ row }) {
  const [selected, setSelected] = useState(null);
  const selCell = selected
    ? getCellData(
        selected.date,
        selected.roster,
        selected.attendance
      )
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{row.fullname.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.cardName}>{row.fullname}</Text>
          <Text style={styles.cardSub}>
            {row.position || 'Staff'} · {row.division || '-'}
          </Text>
        </View>
        <Text style={styles.nik}>{row.employee_id || '-'}</Text>
      </View>

      <View style={styles.miniStats}>
        <View style={[styles.mini, { backgroundColor: colors.green + '1a' }]}>
          <Text style={[styles.miniVal, { color: colors.green }]}>{row.stats.hadir}</Text>
          <Text style={styles.miniLabel}>Hadir</Text>
        </View>
        <View style={[styles.mini, { backgroundColor: colors.yellow + '1a' }]}>
          <Text style={[styles.miniVal, { color: colors.yellow }]}>{row.stats.telat}</Text>
          <Text style={styles.miniLabel}>Telat</Text>
        </View>
        <View style={[styles.mini, { backgroundColor: colors.red + '1a' }]}>
          <Text style={[styles.miniVal, { color: colors.red }]}>{row.stats.alpha}</Text>
          <Text style={styles.miniLabel}>Alpha</Text>
        </View>
        <View style={[styles.mini, { backgroundColor: colors.purple + '1a' }]}>
          <Text style={[styles.miniVal, { color: colors.purple }]}>{row.stats.cuti}</Text>
          <Text style={styles.miniLabel}>Izin/Sakit</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {row.days.map((d) => {
          const cell = getCellData(d.date, d.roster, d.attendance);
          const isSel = selected && selected.date === d.date;
          return (
            <TouchableOpacity
              key={d.date}
              onPress={() => setSelected(isSel ? null : d)}
              style={[
                styles.dayCell,
                { backgroundColor: cell.bg },
                isSel && styles.dayCellSelected,
              ]}
            >
              {cell.deviceType === 'both' ? (
                <View style={styles.deviceDotBoth}>
                  <View style={[styles.deviceDotHalf, { backgroundColor: '#38bdf8' }]} />
                  <View style={[styles.deviceDotHalf, { backgroundColor: '#ffffff' }]} />
                </View>
              ) : cell.deviceType === 'biocloud' ? (
                <View style={[styles.deviceDot, { backgroundColor: '#38bdf8' }]} />
              ) : cell.deviceType === 'app' ? (
                <View style={[styles.deviceDot, { backgroundColor: '#ffffff' }]} />
              ) : null}
              <Text style={[styles.dayNum, { color: colors.muted }]}>{d.date.slice(8)}</Text>
              <Text style={[styles.dayLabel, { color: cell.color }]}>{cell.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selCell && selected && (
        <View style={styles.detail}>
          <Text style={styles.detailDate}>
            {selected.date.slice(8)} {monthName(selected.date.slice(5, 7))} {selected.date.slice(0, 4)}
          </Text>
          <Text style={[styles.detailText, { color: selCell.color }]}>{selCell.title}</Text>
          {selCell.devText ? (
            <Text style={styles.detailDev}>Metode Presensi: {selCell.devText}</Text>
          ) : null}
        </View>
      )}

      <View style={styles.legend}>
        <Legend color={colors.green} label="T = Lengkap" />
        <Legend color={colors.yellow} label="Telat" />
        <Legend color={colors.accentLight} label="TAM/TAP 1x Tap" />
        <Legend color={colors.red} label="X = Alpha" />
        <Legend color={colors.purple} label="I/S = Izin·Sakit" />
        <Legend color={colors.muted} label="L = Libur" />
        <View style={styles.legendDevRow}>
          <Legend color="#38bdf8" label="🔵 BioCloud (Mesin)" />
          <Legend color="#ffffff" label="⚪ Aplikasi (Mobile)" />
          <LegendBoth label="🔵⚪ Keduanya (Split)" />
        </View>
      </View>
    </View>
  );
}

function Legend({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function LegendBoth({ label }) {
  return (
    <View style={styles.legendItem}>
      <View style={styles.deviceDotBothLegend}>
        <View style={[styles.deviceDotHalf, { backgroundColor: '#38bdf8' }]} />
        <View style={[styles.deviceDotHalf, { backgroundColor: '#ffffff' }]} />
      </View>
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 4,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnDisabled: {
    opacity: 0.4,
  },
  monthCenter: {
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.muted,
    marginBottom: 4,
    fontWeight: '600',
  },
  list: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentLight,
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerBody: {
    flex: 1,
  },
  cardName: {
    color: colors.text,
    fontWeight: 'bold',
  },
  cardSub: {
    color: colors.muted,
    fontSize: 11,
  },
  nik: {
    color: colors.muted,
    fontSize: 11,
  },
  miniStats: {
    flexDirection: 'row',
    gap: 8,
  },
  mini: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  miniVal: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  miniLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dayCell: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  deviceDot: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: '#0f172a',
  },
  deviceDotBoth: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 9,
    height: 6,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#0f172a',
  },
  deviceDotHalf: {
    flex: 1,
    height: '100%',
  },
  deviceDotBothLegend: {
    width: 9,
    height: 7,
    borderRadius: 3.5,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  dayNum: {
    fontSize: 8,
    opacity: 0.8,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  detail: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  detailDate: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  detailText: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailDev: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendDevRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border + '66',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.muted,
    fontSize: 10,
  },
});
