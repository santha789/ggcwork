import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getPage } from '../api';
import { Loading, Error } from '../components';
import { computeNotifications } from '../notifications';
import { colors } from '../theme';

const TYPE_COLOR = {
  birthday: colors.pink,
  contract: colors.yellow,
};

function NotifCard({ n }) {
  const color = TYPE_COLOR[n.type];
  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: color + '22' }]}>
        <MaterialIcons
          name={n.type === 'birthday' ? 'cake' : 'event'}
          size={22}
          color={color}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{n.title}</Text>
        <Text style={styles.message}>{n.message}</Text>
      </View>
      <View style={[styles.dayBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.dayText, { color }]}>{n.day}</Text>
      </View>
    </View>
  );
}

export default function NotificationsScreen({ initial, onRefresh }) {
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

  const notifs = computeNotifications(data);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.heading}>
        <Text style={styles.headingTitle}>Notifikasi Pengingat</Text>
        <Text style={styles.headingSub}>
          {notifs.length
            ? `${notifs.length} pengingat aktif hari ini`
            : 'Tidak ada pengingat untuk saat ini'}
        </Text>
      </View>

      {notifs.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="notifications-none" size={44} color={colors.muted} />
          <Text style={styles.emptyText}>
            Semua aman. Tidak ada ulang tahun atau kontrak yang perlu diingatkan.
          </Text>
        </View>
      ) : (
        notifs.map((n) => <NotifCard key={n.id} n={n} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  heading: {
    paddingHorizontal: 4,
  },
  headingTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  headingSub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  message: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  dayBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
});
