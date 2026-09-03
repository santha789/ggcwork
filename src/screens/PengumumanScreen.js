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
import { getPage } from '../api';
import { colors } from '../theme';

import AsyncStorage from '@react-native-async-storage/async-storage';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Baru saja';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm lalu';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'j lalu';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'h lalu';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CategoryBadge({ cat }) {
  const map = {
    all: { label: 'Semua', color: colors.accent },
    permanent: { label: 'Karyawan Tetap', color: colors.green },
    contract: { label: 'Kontrak', color: colors.yellow },
    daily: { label: 'Harian', color: colors.orange },
    internship: { label: 'Magang/PKL', color: colors.purple },
    mitra: { label: 'Mitra', color: colors.indigo },
  };
  const info = map[cat] || { label: cat, color: colors.muted };
  return (
    <View style={[styles.catBadge, { backgroundColor: info.color + '22' }]}>
      <Text style={[styles.catBadgeText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

function AnnouncementCard({ item, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.card, item.is_read && styles.cardRead]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <MaterialIcons name="campaign" size={22} color={colors.accent} />
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.cardDoc}>{item.document_number}</Text>
          <Text style={styles.cardTime}>{item.published_at}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardSnippet} numberOfLines={2}>{item.content_snippet}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.catRow}>
          {(item.target_categories || []).slice(0, 2).map((c) => (
            <CategoryBadge key={c} cat={c} />
          ))}
        </View>
        {item.signatory_name && (
          <Text style={styles.cardSigner}>{item.signatory_name}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function AnnouncementDetail({ item, onBack }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getPage(`/api/v1/announcements/${item.id}`);
        setDetail(res.announcement || res);
      } catch (e) {
        // try alternative path
        try {
          const res2 = await getPage(`/announcements/${item.id}`);
          setDetail(res2.announcement || res2);
        } catch (e2) {
          // use list data as fallback
          setDetail(item);
        }
      }
      setLoading(false);
    })();
  }, [item.id]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <MaterialIcons name="hourglass-empty" size={32} color={colors.muted} />
        <Text style={styles.loadingText}>Memuat pengumuman...</Text>
      </View>
    );
  }

  const d = detail || item;

  return (
    <ScrollView contentContainerStyle={styles.detailContainer}>
      <View style={styles.letterHead}>
        <Text style={styles.companyName}>PT GGC LINK GROUP INDONESIA</Text>
        <Text style={styles.companyAddr}>GGC Building Utama, Jakarta Selatan</Text>
        <View style={styles.letterHeadDivider} />
      </View>

      <View style={styles.detailMeta}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLbl}>Nomor</Text>
          <Text style={styles.detailVal}>{d.document_number}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLbl}>Tanggal</Text>
          <Text style={styles.detailVal}>{d.published_at_formatted || d.published_at}</Text>
        </View>
      </View>

      <Text style={styles.detailTitle}>{d.title}</Text>

      <View style={styles.detailContent}>
        <Text style={styles.detailContentText}>{d.content}</Text>
      </View>

      {d.target_categories && d.target_categories.length > 0 && (
        <View style={styles.targetSection}>
          <Text style={styles.targetLabel}>Ditujukan untuk:</Text>
          <View style={styles.catRow}>
            {d.target_categories.map((c) => (
              <CategoryBadge key={c} cat={c} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.signatory}>
        <Text style={styles.signatoryName}>{d.signatory_name || 'HR Management'}</Text>
        <Text style={styles.signatoryPos}>{d.signatory_position || 'HR Management'}</Text>
      </View>
    </ScrollView>
  );
}

export default function PengumumanScreen({ onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const props = await getPage('/announcements');
      const readRaw = await AsyncStorage.getItem('@ggcwork/read_announcements');
      const readIds = readRaw ? JSON.parse(readRaw) : [];
      const list = (props.announcements || []).map((i) => ({
        ...i,
        is_read: i.is_read || readIds.includes(String(i.id)),
      }));
      setItems(list);
      setError('');
    } catch (e) {
      setError(e.message || 'Gagal memuat pengumuman.');
    }
  }, []);

  async function handleSelect(item) {
    setSelected(item);
    try {
      const readRaw = await AsyncStorage.getItem('@ggcwork/read_announcements');
      const readSet = new Set(readRaw ? JSON.parse(readRaw) : []);
      readSet.add(String(item.id));
      await AsyncStorage.setItem(
        '@ggcwork/read_announcements',
        JSON.stringify(Array.from(readSet))
      );
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i))
      );
    } catch (e) {}
  }

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = filter === 'all' ? items : items.filter((i) =>
    (i.target_categories || []).includes(filter)
  );

  const unreadCount = items.filter((i) => !i.is_read).length;

  if (selected) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Pengumuman Resmi</Text>
          <View style={{ width: 36 }} />
        </View>
        <AnnouncementDetail item={selected} onBack={() => setSelected(null)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Pengumuman Resmi</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <MaterialIcons name="hourglass-empty" size={32} color={colors.muted} />
          <Text style={styles.loadingText}>Memuat pengumuman...</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingWrap}>
          <MaterialIcons name="error-outline" size={32} color={colors.red} />
          <Text style={styles.loadingText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.loadingWrap}>
          <MaterialIcons name="campaign" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Belum Ada Pengumuman</Text>
          <Text style={styles.emptySub}>Pengumuman resmi dari HR akan muncul di sini.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterContent}
          >
            {[
              { key: 'all', label: 'Semua' },
              { key: 'unread', label: `Belum Dibaca (${unreadCount})` },
              { key: 'permanent', label: 'Tetap' },
              { key: 'contract', label: 'Kontrak' },
              { key: 'daily', label: 'Harian' },
              { key: 'internship', label: 'Magang/PKL' },
            ].map((f) => {
              const active = filter === f.key;
              const count = f.key === 'unread'
                ? unreadCount
                : f.key === 'all'
                ? items.length
                : items.filter((i) => (i.target_categories || []).includes(f.key)).length;
              if (f.key !== 'all' && f.key !== 'unread' && count === 0) return null;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          >
            {(filter === 'unread' ? items.filter((i) => !i.is_read) : filtered).map((item) => (
              <AnnouncementCard key={item.id} item={item} onPress={handleSelect} />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  filterRow: {
    maxHeight: 50,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  filterTextActive: {
    color: '#fff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  cardRead: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    flex: 1,
  },
  cardDoc: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  cardTime: {
    fontSize: 10,
    color: colors.muted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  cardSnippet: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  cardSigner: {
    fontSize: 10,
    color: colors.muted,
    fontStyle: 'italic',
  },
  // Detail
  detailContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  letterHead: {
    alignItems: 'center',
    marginBottom: 16,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    letterSpacing: 0.5,
  },
  companyAddr: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  letterHeadDivider: {
    width: 60,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 12,
  },
  detailMeta: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLbl: {
    fontSize: 12,
    color: colors.muted,
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    lineHeight: 26,
  },
  detailContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  detailContentText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  targetSection: {
    marginBottom: 16,
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 6,
  },
  signatory: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  signatoryName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  signatoryPos: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
});
