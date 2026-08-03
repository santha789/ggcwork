import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';
import { Loading } from '../components';
import {
  getToday,
  getOffices,
  getCurrentLocation,
  buildPunchPayload,
  sendPunch,
  haversineMeters,
} from '../attendanceApi';

function clockText() {
  const d = new Date();
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function dateText() {
  const d = new Date();
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function fmtTime(t) {
  if (!t) return '-';
  return String(t).slice(0, 5);
}

function fmtDist(m) {
  if (m === null || m === undefined) return '-';
  if (m < 1000) return Math.round(m) + ' m';
  return (m / 1000).toFixed(2) + ' km';
}

export default function AbsenScreen({ onLoggedOut }) {
  const [now, setNow] = useState(new Date());
  const [today, setToday] = useState(null);
  const [offices, setOffices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState(null);
  const [locError, setLocError] = useState('');
  const [locating, setLocating] = useState(false);
  const [punching, setPunching] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadToday = useCallback(async () => {
    const data = await getToday();
    setToday(data);
    setError('');
    return data;
  }, []);

  const loadOffices = useCallback(async () => {
    const list = await getOffices();
    setOffices(list);
    return list;
  }, []);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadToday(), loadOffices()]);
    } catch (e) {
      if (e.unauthorized && onLoggedOut) {
        Alert.alert('Sesi berakhir', e.message, [{ text: 'OK', onPress: onLoggedOut }]);
      } else {
        setError(e.message);
      }
    }
  }, [loadToday, loadOffices, onLoggedOut]);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadToday(), loadOffices()]);
        setError('');
      } catch (e) {
        if (e.unauthorized && onLoggedOut) {
          Alert.alert('Sesi berakhir', e.message, [{ text: 'OK', onPress: onLoggedOut }]);
        } else {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [loadToday, loadOffices, onLoggedOut]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const office = today?.office || offices[0] || null;

  async function locate() {
    setLocating(true);
    setLocError('');
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
    } catch (e) {
      setLocError(e.message);
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    locate();
  }, []);

  const distance = location && office
    ? haversineMeters(
        office.lat,
        office.lng,
        location.coords.latitude,
        location.coords.longitude
      )
    : null;
  const inside = distance !== null && distance <= (office?.radius_m || 100);

  const attendance = today?.attendance;
  const hasIn = !!attendance?.clock_in;
  const hasOut = !!attendance?.clock_out;
  const punchType = !hasIn ? 'in' : !hasOut ? 'out' : null;
  const locked = today?.punch_lock?.is_locked || false;

  async function doPunch() {
    if (!office) {
      Alert.alert('Info', 'Belum ada kantor aktif yang dikonfigurasi.');
      return;
    }
    if (distance === null) {
      await locate();
      if (!location) return;
    }
    if (!inside) {
      Alert.alert(
        'Di luar area kantor',
        'Kamu berada ' + fmtDist(distance) + ' dari kantor. Radius absen ' + (office?.radius_m || 100) + ' m.'
      );
      return;
    }
    if (punching) return;
    setPunching(true);
    try {
      const loc = location || (await getCurrentLocation());
      const payload = await buildPunchPayload(punchType, office, loc);
      const res = await sendPunch(payload);

      if (res.status === 200 && res.data) {
        const d = res.data.data || {};
        const p = d.punch || {};
        const shownType = p.type === 'out' ? 'pulang' : 'masuk';
        let msg = res.data.message || ('Absen ' + shownType + ' berhasil.');
        if (p.type && p.type !== punchType) {
          msg += '\nTercatat sebagai ' + shownType + ' sesuai jadwal shift.';
        }
        if (p.risk_tier === 'high_risk' || p.risk_tier === 'HIGH_RISK') {
          msg += '\nPerhatian: terdeteksi aktivitas mencurigakan pada perangkat.';
        }
        Alert.alert('Berhasil', msg);
        if (p.lock_status?.action === 'locked') {
          setTimeout(() => refresh(), 600);
        }
      } else if (res.status === 403) {
        await refresh();
        Alert.alert('Terkunci', res.message || 'Fitur absensi terkunci. Hubungi HR/admin.');
      } else if (res.status === 409) {
        Alert.alert('Sudah Tercatat', res.message || 'Punch sudah tercatat.');
      } else if (res.status === 422) {
        Alert.alert('Info', res.message || 'Tidak dapat absen saat ini.');
      } else if (res.status === 429) {
        Alert.alert('Terlalu Banyak', 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.');
      } else {
        Alert.alert('Gagal', res.message || 'Terjadi kesalahan.');
      }
    } catch (e) {
      if (e.unauthorized && onLoggedOut) {
        Alert.alert('Sesi berakhir', e.message, [{ text: 'OK', onPress: onLoggedOut }]);
      } else {
        Alert.alert('Gagal', e.message || 'Terjadi kesalahan.');
      }
    } finally {
      setPunching(false);
      try {
        await refresh();
      } catch (e) {
        // refresh state di tangani refresh()
      }
    }
  }

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.date}>{dateText()}</Text>

      <View style={styles.clockBlock}>
        <Text style={styles.clock}>{clockText()}</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.errorRetry}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {locked ? <LockedCard reason={today?.punch_lock?.reason} onRefresh={onRefresh} /> : null}

      <OfficeCard office={office} />

      <LocationCard
        locating={locating}
        locError={locError}
        distance={distance}
        radius={office?.radius_m || 100}
        inside={inside}
        onLocate={locate}
      />

      {!locked ? (
        <PunchCard
          today={today}
          punchType={punchType}
          inside={inside}
          distance={distance}
          radius={office?.radius_m || 100}
          punching={punching}
          onPunch={doPunch}
        />
      ) : null}

      <PunchLogs logs={today?.punch_logs || []} />

      <Text style={styles.footnote}>
        Verifikasi lokasi radius {office?.radius_m || 100} m dari {office?.name || 'kantor'}.
      </Text>
    </ScrollView>
  );
}

function LockedCard({ reason, onRefresh }) {
  return (
    <View style={[styles.card, styles.lockedCard]}>
      <View style={styles.iconWrap}>
        <MaterialIcons name="lock" size={30} color={colors.red} />
      </View>
      <Text style={styles.lockedTitle}>Absensi Terkunci</Text>
      <Text style={styles.lockedDesc}>
        Terdeteksi aktivitas mencurigakan pada perangkat. Hubungi HR/admin untuk membuka
        kunci{reason ? '.\nAlasan: ' + reason : '.'}
      </Text>
      <TouchableOpacity style={styles.lockedBtn} onPress={onRefresh}>
        <MaterialIcons name="refresh" size={16} color="#fff" />
        <Text style={styles.lockedBtnText}>Periksa Lagi</Text>
      </TouchableOpacity>
    </View>
  );
}

function OfficeCard({ office }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="business" size={18} color={colors.accentLight} />
        <Text style={styles.cardTitle}>Kantor</Text>
      </View>
      <Text style={styles.officeName}>{office?.name || '-'}</Text>
      <Text style={styles.officeSub}>
        Radius absen {office?.radius_m || 100} m
      </Text>
    </View>
  );
}

function LocationCard({ locating, locError, distance, radius, inside, onLocate }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons
          name="my-location"
          size={18}
          color={inside ? colors.green : colors.yellow}
        />
        <Text style={styles.cardTitle}>Lokasi</Text>
      </View>
      {locError ? (
        <Text style={styles.locError}>{locError}</Text>
      ) : locating ? (
        <Text style={styles.muted}>Mendeteksi lokasi...</Text>
      ) : distance !== null ? (
        <View style={styles.locRow}>
          <View>
            <Text style={[styles.distVal, { color: inside ? colors.green : colors.yellow }]}>
              {fmtDist(distance)}
            </Text>
            <Text style={styles.muted}>
              {inside ? 'Kamu di dalam area absen' : 'Di luar area kantor'}
            </Text>
          </View>
          <TouchableOpacity style={styles.smallBtn} onPress={onLocate}>
            <MaterialIcons name="refresh" size={16} color={colors.text} />
            <Text style={styles.smallBtnText}>Ulangi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.smallBtn} onPress={onLocate}>
          <MaterialIcons name="my-location" size={16} color={colors.text} />
          <Text style={styles.smallBtnText}>Dapatkan Lokasi</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PunchCard({ today, punchType, inside, distance, radius, punching, onPunch }) {
  const attendance = today?.attendance;
  const hasIn = !!attendance?.clock_in;
  const hasOut = !!attendance?.clock_out;
  const disabled = !punchType || !inside || punching;

  const action = !punchType
    ? 'Absen Hari Ini Selesai'
    : punchType === 'in'
      ? 'Absen Masuk'
      : 'Absen Pulang';

  return (
    <View style={styles.punchCard}>
      <View style={styles.punchTimes}>
        <View style={styles.punchTimeBox}>
          <Text style={styles.punchTimeLabel}>Masuk</Text>
          <Text style={[styles.punchTimeVal, hasIn && styles.punchTimeDone]}>
            {fmtTime(attendance?.clock_in)}
          </Text>
          <Text style={styles.punchTimeDev}>
            {attendance?.clock_in_device || '-'}
          </Text>
        </View>
        <View style={styles.punchTimeBox}>
          <Text style={styles.punchTimeLabel}>Pulang</Text>
          <Text style={[styles.punchTimeVal, hasOut && styles.punchTimeDone]}>
            {fmtTime(attendance?.clock_out)}
          </Text>
          <Text style={styles.punchTimeDev}>
            {attendance?.clock_out_device || '-'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.punchBtn, (disabled || punching) && styles.punchBtnDisabled]}
        onPress={onPunch}
        disabled={disabled || punching}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={!inside ? [colors.cardAlt, colors.cardAlt] : [colors.green, colors.emerald]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.punchBtnGrad}
        >
          <MaterialIcons
            name={punchType === 'in' ? 'login' : punchType === 'out' ? 'logout' : 'check'}
            size={30}
            color={!inside ? colors.muted : '#fff'}
          />
          <Text style={[styles.punchBtnText, { color: !inside ? colors.muted : '#fff' }]}>
            {punching ? 'Memproses...' : action}
          </Text>
          {!inside && distance !== null ? (
            <Text style={styles.punchBtnSub}>
              Pindah ke dalam radius {radius} m
            </Text>
          ) : (
            <Text style={styles.punchBtnSub}>Gunakan lokasi GPS real-time</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function PunchLogs({ logs }) {
  if (!logs || !logs.length) return null;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="history" size={18} color={colors.accentLight} />
        <Text style={styles.cardTitle}>Riwayat Hari Ini</Text>
      </View>
      {logs.map((l) => (
        <View key={l.id} style={styles.logRow}>
          <View style={styles.logLeft}>
            <Text style={styles.logType}>
              {l.punch_type === 'in' ? 'Masuk' : 'Pulang'}
            </Text>
            <Text style={styles.logTime}>
              {l.punch_at ? new Date(l.punch_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
            </Text>
          </View>
          <Text
            style={[
              styles.logStatus,
              l.status === 'accepted' ? styles.logAccepted : styles.logRejected,
            ]}
          >
            {l.status === 'accepted' ? 'Diterima' : 'Ditolak'}
          </Text>
          <Text style={styles.logDist}>{fmtDist(l.distance_m)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 14,
  },
  date: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  clockBlock: {
    alignItems: 'center',
  },
  clock: {
    color: colors.text,
    fontSize: 56,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  errorBanner: {
    backgroundColor: colors.red + '22',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    flex: 1,
  },
  errorRetry: {
    color: colors.red,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  officeName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  officeSub: {
    color: colors.muted,
    fontSize: 12,
  },
  muted: {
    color: colors.muted,
    fontSize: 12,
  },
  locError: {
    color: colors.red,
    fontSize: 12,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distVal: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  lockedCard: {
    backgroundColor: colors.red + '15',
    borderColor: colors.red + '55',
    alignItems: 'center',
    gap: 8,
    padding: 18,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.red + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    color: colors.red,
    fontSize: 17,
    fontWeight: 'bold',
  },
  lockedDesc: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  lockedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.red,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  lockedBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  punchCard: {
    borderRadius: 20,
    padding: 16,
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  punchTimes: {
    flexDirection: 'row',
    gap: 10,
  },
  punchTimeBox: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  punchTimeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  punchTimeVal: {
    color: colors.text,
    fontSize: 26,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  punchTimeDone: {
    color: colors.green,
  },
  punchTimeDev: {
    color: colors.muted,
    fontSize: 10,
  },
  punchBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  punchBtnDisabled: {
    opacity: 0.6,
  },
  punchBtnGrad: {
    alignItems: 'center',
    padding: 18,
    gap: 4,
  },
  punchBtnText: {
    fontWeight: 'bold',
    fontSize: 17,
  },
  punchBtnSub: {
    fontSize: 11,
    opacity: 0.8,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border + '55',
  },
  logLeft: {
    flex: 1,
  },
  logType: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  logTime: {
    color: colors.muted,
    fontSize: 11,
  },
  logStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  logAccepted: {
    color: colors.green,
  },
  logRejected: {
    color: colors.red,
  },
  logDist: {
    color: colors.muted,
    fontSize: 11,
  },
  footnote: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
