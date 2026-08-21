import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
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

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function contractInfo(profile) {
  if (!profile) return null;
  const contracts = profile.contracts || [];
  const active = contracts.find((c) => c.status === 'active') || contracts[0];
  const endDate = active?.end_date || profile.end_date;
  if (!endDate) return null;

  const end = new Date(endDate + 'T00:00:00');
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.round((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
  );

  let color = colors.green;
  if (daysLeft <= 7) {
    color = colors.red;
  } else if (daysLeft <= 30) {
    color = colors.yellow;
  }

  const endFmt = end.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    number: active?.contract_number || '',
    endDate,
    endFmt,
    daysLeft,
    color,
  };
}

function computeMyStats(attData) {
  const month = attData.month || new Date().getMonth() + 1;
  const year = attData.year || new Date().getFullYear();
  const daysInMonth = attData.daysInMonth || 31;
  const myId = attData.myId;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const attByDate = {};
  (attData.attendances[String(myId)] || []).forEach((a) => {
    attByDate[a.date] = a;
  });
  const rosterByDate = {};
  (attData.rosters[String(myId)] || []).forEach((r) => {
    rosterByDate[r.date] = r;
  });

  let scheduled = 0;
  let hadir = 0;
  let telat = 0;
  let alpha = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (date > todayStr) break;
    const roster = rosterByDate[date];
    if (roster && (roster.is_day_off || !roster.shift_id)) continue;
    const att = attByDate[date];
    if (date === todayStr && !att) continue;
    scheduled += 1;
    const status = att?.status;
    if (status === 'TAP' || status === 'Hadir' || status === 'Telat' || status === 'TAM') {
      hadir += 1;
      if ((att?.late_minutes || 0) > 0) telat += 1;
    } else if (date < todayStr) {
      alpha += 1;
    }
  }

  const pct = scheduled > 0 ? Math.round((hadir / scheduled) * 100) : 0;
  return { month, year, scheduled, hadir, telat, alpha, pct };
}

function QuickCircle({ label, value, icon, color, onPress }) {
  return (
    <TouchableOpacity
      style={styles.quickItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.quickIcon, { backgroundColor: color + '22' }]}>
        <MaterialIcons name={icon} size={24} color={color} />
        {value !== null && value !== undefined && value > 0 ? (
          <View style={[styles.quickBadge, { backgroundColor: color }]}>
            <Text style={styles.quickBadgeText}>
              {value > 99 ? '99+' : value}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ user, initial, onNavigate, onOpenAttendance, onOpenShift, onOpenPayroll, onOpenLeave, onOpenPerformance, onOpenAsset, onOpenPoin, onOpenTagihan, onOpenKPI, onOpenPengumuman }) {
  const [dash, setDash] = useState(initial || null);
  const [attData, setAttData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pageW, setPageW] = useState(0);
  const [page, setPage] = useState(0);
  const moreRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [d, a, p] = await Promise.all([
        getPage('/dashboard'),
        getPage('/attendance/summary'),
        getPage('/profile'),
      ]);
      setDash(d);
      setAttData({ ...a, myId: user?.id });
      setProfile(p.userProfile || null);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [user]);

  useEffect(() => {
    if (initial) setDash(initial);
  }, [initial]);

  useEffect(() => {
    if (!dash || !attData) load();
  }, [dash, attData, load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) return <Error message={error} onRetry={load} />;
  if (!dash || !attData) return <Loading />;

  const s = computeMyStats(attData);
  const pendingLeaves = dash.pendingLeaves || [];
  const kontrak = contractInfo(profile);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <LinearGradient
        colors={['#151d31', '#1e2a44']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.attCard}
      >
        <View style={styles.attTop}>
          <View style={styles.attInfo}>
            <Text style={styles.attLabel}>
              {todayLabel()}
            </Text>
            <Text style={styles.attValue}>{s.pct}%</Text>
            <Text style={styles.attSub}>
              {s.hadir} hadir dari {s.scheduled} hari kerja
            </Text>
          </View>
          <View style={[styles.attPill, { backgroundColor: colors.emerald + '22' }]}>
            <Text style={[styles.attPillText, { color: colors.emerald }]}>
              {s.pct >= 80 ? 'BAIK' : s.pct >= 60 ? 'CUKUP' : 'KURANG'}
            </Text>
          </View>
        </View>
        <View style={styles.heroBar}>
          <View style={[styles.heroBarFill, { width: `${s.pct}%` }]} />
        </View>
        <View style={styles.attRow}>
          <View style={styles.attStat}>
            <Text style={[styles.attStatVal, { color: colors.green }]}>{s.hadir}</Text>
            <Text style={styles.attStatLabel}>Hadir</Text>
          </View>
          <View style={styles.attStat}>
            <Text style={[styles.attStatVal, { color: colors.yellow }]}>{s.telat}</Text>
            <Text style={styles.attStatLabel}>Telat</Text>
          </View>
          <View style={styles.attStat}>
            <Text style={[styles.attStatVal, { color: colors.red }]}>{s.alpha}</Text>
            <Text style={styles.attStatLabel}>Alpha</Text>
          </View>
        </View>
        {kontrak && (
          <View style={styles.contractRow}>
            <View style={[styles.contractIcon, { backgroundColor: kontrak.color + '22' }]}>
              <MaterialIcons name="event" size={18} color={kontrak.color} />
            </View>
            <View style={styles.contractBody}>
              <Text style={styles.contractTitle}>
                Kontrak berakhir {kontrak.endFmt}
              </Text>
              <Text style={styles.contractSub}>
                {kontrak.number || 'Kontrak aktif'}
              </Text>
            </View>
            <View style={[styles.contractBadge, { backgroundColor: kontrak.color + '22' }]}>
              <Text style={[styles.contractBadgeText, { color: kontrak.color }]}>
                {kontrak.daysLeft} hari
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>

      <Text style={styles.sectionHead}>Menu Cepat</Text>
      <View
        style={styles.quickCard}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width - 2;
          if (Math.abs(w - pageW) > 1) setPageW(w);
        }}
      >
        <ScrollView
          ref={moreRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(pageW, 1)))
          }
        >
          <View style={[styles.quickPage, { width: pageW || '100%' }]}>
            <QuickCircle
              label="Absensi"
              value={s.hadir}
              icon="event-available"
              color={colors.emerald}
              onPress={onOpenAttendance}
            />
            <QuickCircle
              label="Jadwal Shift"
              icon="schedule"
              color={colors.yellow}
              onPress={onOpenShift}
            />
            <QuickCircle
              label="Slip Gaji"
              icon="receipt-long"
              color={colors.green}
              onPress={onOpenPayroll}
            />
            <QuickCircle
              label="Cuti"
              value={pendingLeaves.length}
              icon="flight-takeoff"
              color={colors.accentLight}
              onPress={onOpenLeave}
            />
            <QuickCircle
              label="Performa"
              icon="emoji-events"
              color={colors.yellow}
              onPress={onOpenPerformance}
            />
            <QuickCircle
              label="Profil"
              icon="person"
              color={colors.indigo}
              onPress={() => onNavigate && onNavigate('profile')}
            />
            <QuickCircle
              label="Chat"
              icon="forum"
              color={colors.emerald}
              onPress={() => onNavigate && onNavigate('chat')}
            />
            <QuickCircle
              label="Curhat"
              icon="groups"
              color={colors.purple}
              onPress={() => onNavigate && onNavigate('curhat')}
            />
          </View>
          <View style={[styles.quickPage, { width: pageW || '100%' }]}>
            <QuickCircle
              label="Pengumuman"
              icon="campaign"
              color={colors.red}
              onPress={onOpenPengumuman}
            />
            <QuickCircle
              label="Asset"
              icon="inventory-2"
              color={colors.accentLight}
              onPress={onOpenAsset}
            />
            <QuickCircle
              label="Poin"
              icon="stars"
              color={colors.yellow}
              onPress={onOpenPoin}
            />
            <QuickCircle
              label="Tagihan"
              icon="receipt"
              color={colors.red}
              onPress={onOpenTagihan}
            />
            <QuickCircle
              label="KPI"
              icon="track-changes"
              color={colors.emerald}
              onPress={onOpenKPI}
            />
          </View>
        </ScrollView>
      </View>

      <View style={styles.dots}>
        <View style={[styles.dot, page === 0 && styles.dotActive]} />
        <View style={[styles.dot, page === 1 && styles.dotActive]} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  contractIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractBody: {
    flex: 1,
    gap: 2,
  },
  contractTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  contractBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  contractBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  contractSub: {
    color: colors.muted,
    fontSize: 11,
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  sectionHead: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  attCard: {
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attInfo: {
    flex: 1,
  },
  attLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  attValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: 'bold',
  },
  attSub: {
    color: colors.muted,
    fontSize: 12,
  },
  attPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  attPillText: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden',
  },
  heroBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald,
  },
  attRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  attStat: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  attStatVal: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  attStatLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  quickPage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    paddingBottom: 14,
    rowGap: 14,
    columnGap: 0,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: -4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accentLight,
    width: 18,
  },
  quickItem: {
    width: '25%',
    alignItems: 'center',
    gap: 8,
  },
  quickIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  quickBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  quickLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 11,
  },
});
