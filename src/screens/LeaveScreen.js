import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
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

const STATUS_META = {
  pending: { color: colors.yellow, label: 'Menunggu' },
  approved: { color: colors.green, label: 'Disetujui' },
  rejected: { color: colors.red, label: 'Ditolak' },
  canceled: { color: colors.muted, label: 'Dibatalkan' },
};

export default function LeaveScreen({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const props = await getPage('/leave');
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

  const leaves = data.leaves || {};
  const list = leaves.data || [];
  const balance = data.userBalance;

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Cuti</Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      {balance ? (
        <LinearGradient
          colors={['#1d4ed8', '#4f46e5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceTitle}>Saldo Cuti</Text>
          <Text style={styles.balanceValue}>
            {balance.remaining ?? '-'}
            <Text style={styles.balanceUnit}> hari tersisa</Text>
          </Text>
        </LinearGradient>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Belum ada pengajuan cuti</Text>
        }
        renderItem={({ item }) => <LeaveCard item={item} />}
      />
    </View>
  );
}

function LeaveCard({ item }) {
  const meta = STATUS_META[item.status] || {
    color: colors.muted,
    label: (item.status || 'unknown').toUpperCase(),
  };
  const name = item.user?.fullname || `${item.firstname || ''} ${item.lastname || ''}`;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{name}</Text>
        <View style={[styles.badge, { backgroundColor: meta.color + '22' }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>
            {meta.label.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.cardSub}>
        {item.leave_type?.name || item.leave_type || 'Cuti'}
      </Text>
      <View style={styles.dateRow}>
        <View style={styles.dateBox}>
          <Text style={styles.dateLabel}>MULAI</Text>
          <Text style={styles.dateValue}>{item.start_date || '-'}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.dateBox}>
          <Text style={styles.dateLabel}>SELESAI</Text>
          <Text style={styles.dateValue}>{item.end_date || '-'}</Text>
        </View>
      </View>
      {item.reason ? (
        <Text style={styles.cardReason}>{item.reason}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  balanceCard: {
    borderRadius: 18,
    padding: 18,
    gap: 2,
  },
  balanceTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  balanceValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
  },
  balanceUnit: {
    fontSize: 14,
    fontWeight: 'normal',
    color: 'rgba(255,255,255,0.9)',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnPlaceholder: {
    width: 40,
  },
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    color: colors.text,
    fontWeight: 'bold',
    flex: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  cardSub: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  dateBox: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 10,
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1,
  },
  dateValue: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    marginTop: 2,
  },
  arrow: {
    color: colors.muted,
    fontSize: 16,
  },
  cardReason: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
