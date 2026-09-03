import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Loading, Error } from '../components';
import { computeNotifications } from '../notifications';
import { colors } from '../theme';

const TYPE_META = {
  checkout: { color: colors.yellow || '#f59e0b', icon: 'schedule' },
  announcement: { color: colors.accentLight || '#3b82f6', icon: 'campaign' },
  birthday: { color: colors.pink, icon: 'cake' },
  contract: { color: colors.yellow, icon: 'event' },
  curhat: { color: colors.purple, icon: 'forum' },
  chat: { color: colors.emerald, icon: 'chat-bubble' },
};

function NotifCard({ n, onPress }) {
  const meta = TYPE_META[n.type] || TYPE_META.curhat;
  const color = meta.color;
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress && onPress(n)}
      activeOpacity={0.7}
    >
      <View style={[styles.icon, { backgroundColor: color + '22' }]}>
        <MaterialIcons name={meta.icon} size={22} color={color} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{n.title}</Text>
        <Text style={styles.message}>{n.message}</Text>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.dayBadge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.dayText, { color }]}>{n.day}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen({ dashboard, profile, posts, rooms, lastSeen, myId, onMarkAllSeen, onOpen, onRefresh }) {
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
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!dashboard) load();
  }, [dashboard, load]);

  const notifs = dashboard
    ? computeNotifications({
        dashboard,
        profile,
        posts,
        rooms,
        lastSeen,
        myId,
      })
    : [];

  const idsKey = notifs.map((n) => n.id).join('|');
  useEffect(() => {
    if (notifs.length && onMarkAllSeen) {
      onMarkAllSeen(notifs.map((n) => n.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) return <Error message={error} onRetry={load} />;
  if (!dashboard) return <Loading />;

  const groups = {
    birthday: notifs.filter((n) => n.type === 'birthday').length,
    contract: notifs.filter((n) => n.type === 'contract').length,
    curhat: notifs.filter((n) => n.type === 'curhat').length,
    chat: notifs.filter((n) => n.type === 'chat').length,
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.heading}>
        <Text style={styles.headingTitle}>Notifikasi</Text>
        <Text style={styles.headingSub}>
          {notifs.length
            ? `${notifs.length} notifikasi aktif`
            : 'Tidak ada notifikasi untuk saat ini'}
        </Text>
      </View>

      {Object.entries(groups).some(([, v]) => v > 0) ? (
        <View style={styles.chips}>
          {Object.entries(groups)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <View key={k} style={styles.chip}>
                <MaterialIcons
                  name={TYPE_META[k].icon}
                  size={14}
                  color={TYPE_META[k].color}
                />
                <Text style={[styles.chipText, { color: TYPE_META[k].color }]}>
                  {v} {k === 'birthday' ? 'Ulang Tahun' : k}
                </Text>
              </View>
            ))}
        </View>
      ) : null}

      {notifs.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="notifications-none" size={44} color={colors.muted} />
          <Text style={styles.emptyText}>
            Semua aman. Tidak ada pengingat ulang tahun, kontrak, curhat, atau
            pesan baru.
          </Text>
        </View>
      ) : (
        notifs.map((n) => <NotifCard key={n.id} n={n} onPress={onOpen} />)
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
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
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
