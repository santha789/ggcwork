import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { getPage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';
import { computeNotifications } from '../notifications';

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function Shortcut({ label, value, icon, color, onPress }) {
  return (
    <TouchableOpacity
      style={styles.shortcut}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.shortcutTop}>
        <View style={[styles.shortcutIcon, { backgroundColor: color + '22' }]}>
          <MaterialIcons name={icon} size={24} color={color} />
        </View>
        {value !== null && value !== undefined ? (
          <View style={[styles.shortcutBadge, { backgroundColor: color }]}>
            <Text style={styles.shortcutBadgeText}>{value}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
      <MaterialIcons
        name="arrow-forward-ios"
        size={12}
        color={colors.muted}
        style={styles.shortcutArrow}
      />
    </TouchableOpacity>
  );
}

function Collapse({ title, count, color, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <View style={[styles.sectionDot, { backgroundColor: color }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {typeof count === 'number' && count > 0 ? (
          <View style={[styles.sectionBadge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.sectionBadgeText, { color }]}>{count}</Text>
          </View>
        ) : null}
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.muted}
        />
      </TouchableOpacity>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function PersonRow({ p, extra, color, rightLabel }) {
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: color + '22' }]}>
        <Text style={[styles.avatarText, { color }]}>
          {p.fullname ? p.fullname.slice(0, 2).toUpperCase() : '??'}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{p.fullname}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {p.position} · {p.sub_division || p.division}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowRightVal, { color }]}>{extra}</Text>
        {rightLabel ? (
          <Text style={styles.rowRightLabel}>{rightLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function DashboardScreen({ initial, onRefresh, onNavigate }) {
  const [data, setData] = useState(initial || null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (onRefresh) {
      try {
        await onRefresh();
        setError('');
      } catch (e) {
        setError(e.message);
      }
      return;
    }
    try {
      const props = await getPage('/dashboard');
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (initial) setData(initial);
  }, [initial]);

  useEffect(() => {
    if (!data) load();
  }, [data, load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) return <Error message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const s = data.stats || {};
  const pendingLeaves = data.pendingLeaves || [];
  const notifCount = computeNotifications(data).length;

  const hadir = s.hadir_today ?? 0;
  const telat = s.telat_today ?? 0;
  const absen = s.absent_today ?? 0;
  const total = s.total_employees ?? 0;
  const hadirPct = total > 0 ? Math.round((hadir / total) * 100) : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <LinearGradient
        colors={['#1d4ed8', '#4f46e5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroDate}>{todayLabel()}</Text>
        <Text style={styles.heroTitle}>Selamat datang! 👋</Text>
        <Text style={styles.heroSub}>
          {hadir} dari {total} karyawan sudah hadir ({hadirPct}%)
        </Text>
        <View style={styles.heroBar}>
          <View style={[styles.heroBarFill, { width: `${hadirPct}%` }]} />
        </View>
      </LinearGradient>

      <Text style={styles.sectionHead}>Menu Cepat</Text>
      <View style={styles.shortcuts}>
        <Shortcut
          label="Absensi"
          value={hadir}
          icon="event-available"
          color={colors.emerald}
          onPress={() => onNavigate && onNavigate('attendance')}
        />
        <Shortcut
          label="Cuti"
          value={pendingLeaves.length}
          icon="flight-takeoff"
          color={colors.accentLight}
          onPress={() => onNavigate && onNavigate('leave')}
        />
        <Shortcut
          label="Karyawan"
          value={total}
          icon="people"
          color={colors.indigo}
          onPress={() => onNavigate && onNavigate('employees')}
        />
        <Shortcut
          label="Notifikasi"
          value={notifCount}
          icon="notifications"
          color={colors.pink}
          onPress={() => onNavigate && onNavigate('notifications')}
        />
      </View>

      <Text style={styles.sectionHead}>Kabar Terkini</Text>
      <Collapse
        title="Baru Saja Hadir"
        count={(data.hadirList || []).length}
        color={colors.green}
      >
        {(data.hadirList || []).map((p) => (
          <PersonRow
            key={p.id}
            p={p}
            extra={p.clock_in || '-'}
            color={colors.green}
            rightLabel="Hadir"
          />
        ))}
        {!(data.hadirList || []).length && (
          <Text style={styles.empty}>Belum ada yang hadir</Text>
        )}
      </Collapse>

      <Collapse
        title="Terlambat"
        count={(data.telatList || []).length}
        color={colors.yellow}
      >
        {(data.telatList || []).map((p) => (
          <PersonRow
            key={p.id}
            p={p}
            extra={p.clock_in || '-'}
            color={colors.yellow}
            rightLabel="Telat"
          />
        ))}
        {!(data.telatList || []).length && (
          <Text style={styles.empty}>Tidak ada yang terlambat</Text>
        )}
      </Collapse>

      <Collapse
        title="Belum Hadir"
        count={(data.absentList || []).length}
        color={colors.red}
      >
        {(data.absentList || []).map((p) => (
          <PersonRow
            key={p.id}
            p={p}
            extra="—"
            color={colors.red}
            rightLabel="Belum"
          />
        ))}
        {!(data.absentList || []).length && (
          <Text style={styles.empty}>Semua sudah hadir</Text>
        )}
      </Collapse>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 22,
    padding: 20,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heroDate: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 4,
  },
  heroBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 14,
    overflow: 'hidden',
  },
  heroBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald,
  },
  sectionHead: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shortcut: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  shortcutTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shortcutIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  shortcutBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  shortcutLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  shortcutArrow: {
    position: 'absolute',
    right: 10,
    bottom: 12,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
    flex: 1,
  },
  sectionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionBody: {
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    color: colors.text,
    fontWeight: '600',
  },
  rowSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowRightVal: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  rowRightLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  empty: {
    color: colors.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
