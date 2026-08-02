import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getPage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';

function monthName(m) {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return names[(m || 1) - 1] || m;
}

function fmtTime(t) {
  if (!t) return '-';
  return t.slice(0, 5);
}

function computeStats(days) {
  let hadir = 0;
  let telat = 0;
  let alpha = 0;
  days.forEach((d) => {
    if (d.is_day_off) return;
    const s = d.attendance?.status || 'TAM';
    if (s === 'TAP' || s === 'Hadir') hadir += 1;
    else alpha += 1;
    if ((d.attendance?.late_minutes || 0) > 0) telat += 1;
  });
  return { hadir, telat, alpha };
}

export default function AttendanceScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const props = await getPage('/attendance/summary');
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) return <Error message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const users = data.users || [];
  const attendances = data.attendances || {};
  const rosters = data.rosters || {};

  const rows = users.map((u) => {
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
      const roster = rosterByDate[date];
      const att = attByDate[date];
      days.push({
        date,
        is_day_off: roster?.is_day_off || false,
        attendance: att || null,
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
      <Text style={styles.title}>Absensi</Text>
      <Text style={styles.subtitle}>
        {monthName(data.month)} {data.year} · {data.daysInMonth} hari
      </Text>

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
      </View>

      <View style={styles.grid}>
        {row.days.map((d) => {
          const s = d.attendance?.status || (d.is_day_off ? 'OFF' : '');
          let bg = colors.cardAlt;
          let fg = colors.text;
          if (s === 'OFF') {
            bg = colors.border;
            fg = colors.muted;
          } else if (s === 'Hadir' || s === 'TAP') {
            bg = colors.green + '33';
            fg = colors.green;
          } else if (s === 'TAM') {
            bg = colors.red + '33';
            fg = colors.red;
          }
          return (
            <View key={d.date} style={[styles.dayCell, { backgroundColor: bg }]}>
              <Text style={[styles.dayText, { color: fg }]}>{d.date.slice(8)}</Text>
              <Text style={[styles.dayTime, { color: fg }]}>
                {d.attendance ? fmtTime(d.attendance.clock_in) : s === 'OFF' ? 'L' : '-'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.muted,
    marginBottom: 8,
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
  },
  dayText: {
    fontSize: 10,
    fontWeight: '600',
  },
  dayTime: {
    fontSize: 8,
    opacity: 0.9,
  },
});
