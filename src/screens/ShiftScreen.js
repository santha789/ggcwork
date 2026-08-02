import { useCallback, useEffect, useState } from 'react';
import {
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
import { shiftName, shiftShort } from '../shifts';

function monthName(m) {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return names[(m || 1) - 1] || m;
}

export default function ShiftScreen({ user, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  const load = useCallback(async (m, y) => {
    try {
      const props = await getPage(`/attendance/summary?month=${m}&year=${y}`);
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

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

  const isFuture =
    viewYear > new Date().getFullYear() ||
    (viewYear === new Date().getFullYear() && viewMonth > new Date().getMonth() + 1);

  if (error) return <Error message={error} onRetry={() => load(viewMonth, viewYear)} />;
  if (!data) return <Loading />;

  const attendances = data.attendances || {};
  const rosters = data.rosters || {};
  const myId = user?.id;

  const rosterByDate = {};
  (rosters[String(myId)] || []).forEach((r) => {
    rosterByDate[r.date] = r;
  });

  const cells = [];
  for (let d = 1; d <= (data.daysInMonth || 31); d++) {
    const date = `${data.year}-${String(data.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = rosterByDate[date] || null;
    const isOff = !!(r && (r.is_day_off || !r.shift_id));
    cells.push({
      date,
      shift_id: isOff ? null : r?.shift_id,
      isOff,
    });
  }

  const shiftSet = new Set(cells.filter((c) => c.shift_id).map((c) => c.shift_id));

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.monthCenter}>
          <Text style={styles.title}>
            {monthName(data.month)} {data.year}
          </Text>
          <Text style={styles.subtitle}>Jadwal Shift</Text>
        </View>
        <View style={styles.backBtnPlaceholder} />
      </View>

      <View style={styles.monthBar}>
        <TouchableOpacity style={styles.monthBtn} onPress={() => goMonth(-1)}>
          <MaterialIcons name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.monthCenter2}>
          <Text style={styles.monthLabel}>
            {monthName(data.month)} {data.year}
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

      <View style={styles.gridCard}>
        <View style={styles.grid}>
          {cells.map((c) => (
            <View
              key={c.date}
              style={[
                styles.cell,
                { backgroundColor: c.isOff ? colors.border + '66' : colors.cardAlt },
              ]}
            >
              <Text style={[styles.dayNum, { color: colors.muted }]}>{c.date.slice(8)}</Text>
              <Text
                style={[
                  styles.shiftLabel,
                  { color: c.isOff ? colors.muted : colors.accentLight },
                ]}
              >
                {c.isOff ? 'OFF' : shiftShort(c.shift_id)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.legendCard}>
        {Array.from(shiftSet).map((sid) => (
          <View key={sid} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.accentLight }]} />
            <Text style={styles.legendText}>{shiftName(sid)}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text style={styles.legendText}>OFF / Libur</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  monthCenter: {
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
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
  monthCenter2: {
    flex: 1,
    alignItems: 'center',
  },
  monthLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  gridCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  cell: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 8,
    opacity: 0.8,
  },
  shiftLabel: {
    fontSize: 8,
    fontWeight: '800',
  },
  legendCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
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
