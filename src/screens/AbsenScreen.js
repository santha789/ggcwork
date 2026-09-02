import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../theme';
import { Loading } from '../components';
import {
  getToday,
  getOffices,
  getCurrentLocation,
  buildPunchPayload,
  sendPunch,
  haversineMeters,
  reverseGeocode,
  apiLogin,
  apiMe,
  getStoredToken,
  getStoredLoginEmail,
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

function timeToMin(t) {
  if (!t) return null;
  const parts = String(t).split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  if (Number.isNaN(h)) return null;
  return h * 60 + m;
}

function fmtClock(min) {
  if (min === null || min === undefined || Number.isNaN(min)) return '-';
  return (
    String(Math.floor(min / 60)).padStart(2, '0') +
    ':' +
    String(min % 60).padStart(2, '0')
  );
}

function getCooldownInfo(actionState, now) {
  if (!actionState || actionState.type !== 'clock_out') {
    return { inCooldown: false, minutesLeft: 0, canPunchAt: null };
  }
  if (actionState.can_punch) {
    return { inCooldown: false, minutesLeft: 0, canPunchAt: null };
  }
  const canPunchAt = actionState.can_punch_at
    ? new Date(actionState.can_punch_at)
    : null;
  if (canPunchAt && !isNaN(canPunchAt.getTime())) {
    const diffS = Math.max(0, Math.floor((canPunchAt - now) / 1000));
    const minutesLeft = Math.ceil(diffS / 60);
    return { inCooldown: true, minutesLeft, canPunchAt };
  }
  return {
    inCooldown: true,
    minutesLeft: actionState.cooldown_remaining_minutes || 0,
    canPunchAt: null,
  };
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
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectEmail, setConnectEmail] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [address, setAddress] = useState(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

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

  const loadUser = useCallback(async () => {
    try {
      const res = await apiMe();
      if (res?.user) setUser(res.user);
    } catch (e) {
      // izin/token bisa beirmasalah; jangan fatal — hanya profil overlay
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadToday(), loadOffices(), loadUser()]);
    } catch (e) {
      if (e.unauthorized && onLoggedOut) {
        Alert.alert('Sesi berakhir', e.message, [{ text: 'OK', onPress: onLoggedOut }]);
      } else {
        setError(e.message);
      }
    }
  }, [loadToday, loadOffices, loadUser, onLoggedOut]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getStoredToken();
        if (!token) {
          const savedEmail = (await getStoredLoginEmail()) || '';
          setConnectEmail(savedEmail);
          setConnectOpen(true);
          setLoading(false);
          return;
        }
        await Promise.all([loadToday(), loadOffices(), loadUser()]);
        setError('');
      } catch (e) {
        if (e.unauthorized && onLoggedOut) {
          Alert.alert('Sesi berakhir', e.message, [{ text: 'OK', onPress: onLoggedOut }]);
        } else {
          setError(e.message);
          if (e.message && e.message.includes('Sesi absen')) {
            const savedEmail = (await getStoredLoginEmail()) || '';
            setConnectEmail(savedEmail);
            setConnectOpen(true);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [loadToday, loadOffices, loadUser, onLoggedOut]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function doConnect() {
    if (!connectEmail || !connectPassword) {
      setConnectError('Isi email dan password absen.');
      return;
    }
    setConnectLoading(true);
    setConnectError('');
    try {
      await apiLogin(connectEmail.trim(), connectPassword);
      setConnectOpen(false);
      setConnectPassword('');
      setError('');
      await refresh();
    } catch (e) {
      setConnectError(e.message || 'Sambungkan gagal. Periksa email/password.');
    } finally {
      setConnectLoading(false);
    }
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
  const allowAnywhere = !!today?.allow_anywhere_punch;
  const inside = allowAnywhere
    ? distance !== null
    : distance !== null && distance <= (office?.radius_m || 100);

  const attendance = today?.attendance;
  const hasIn = !!attendance?.clock_in;
  const hasOut = !!attendance?.clock_out;
  const actionState = today?.action_state || {};
  const punchType =
    actionState.type === 'clock_in' ? 'in'
    : actionState.type === 'clock_out' ? 'out'
    : null;
  const locked = today?.punch_lock?.is_locked || false;

  const shift = today?.shift || null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const shiftStartMin = shift?.start_time ? timeToMin(shift.start_time) : null;
  const inOpenMin = shiftStartMin !== null ? shiftStartMin - 120 : null;
  const inGateOpen = punchType !== 'in' || inOpenMin === null || nowMin >= inOpenMin;

  const cooldown = getCooldownInfo(actionState, now);
  const cooldownActive = cooldown.inCooldown && punchType === 'out';

  async function doPunch(photoUriArg) {
    if (!office) {
      Alert.alert('Info', 'Belum ada kantor aktif yang dikonfigurasi.');
      return;
    }
    if (distance === null) {
      await locate();
      if (!location) return;
    }
    if (!inside && !allowAnywhere) {
      Alert.alert(
        'Di luar area kantor',
        'Kamu berada ' + fmtDist(distance) + ' dari kantor. Radius absen ' + (office?.radius_m || 100) + ' m.'
      );
      return;
    }
    if (punching) return;

    // Foto selfie sebagai bukti evident wajib diambil di setiap absen.
    const validUriArg = (typeof photoUriArg === 'string' && photoUriArg.length > 0) ? photoUriArg : null;
    const uri = validUriArg || (typeof photoUri === 'string' ? photoUri : null);
    if (!uri) {
      openCamera();
      return;
    }

    setPunching(true);
    try {
      const loc = location || (await getCurrentLocation());
      const payload = await buildPunchPayload(punchType, office, loc, {
        photo: {
          uri: uri,
          name: 'selfie.jpg',
          type: 'image/jpeg',
        },
        batteryLevel: null,
      });
      const res = await sendPunch(payload);

      if (res.status === 200 && res.data) {
        setPhotoUri(null);
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
      } else if (res.status === 403 || res.status === 423) {
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

  async function openCamera() {
    if (photoLoading) return;
    if (!cameraPermission?.granted) {
      const req = await requestCameraPermission();
      if (!req.granted) {
        Alert.alert('Izin kamera ditolak', 'Aktifkan izin kamera untuk mengambil foto bukti absen.');
        return;
      }
    }
    setPhotoOpen(true);
    // Siapkan alamat reverse-geocode utk overlay live kamera (bila belum ada & punya lokasi)
    if (!address && location) {
      const addr = await reverseGeocode(location.coords.latitude, location.coords.longitude);
      if (addr) setAddress(addr);
    }
  }

  async function snapPhoto() {
    if (!cameraRef.current || photoLoading) return;
    setPhotoLoading(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false });
      setPhotoUri(pic.uri);
      setPhotoOpen(false);
      Alert.alert(
        'Foto diambil',
        'Lanjutkan absen dengan foto bukti ini?',
        [
          { text: 'Ulangi', style: 'cancel', onPress: () => { setPhotoUri(null); setPhotoOpen(true); } },
          { text: 'Lanjut Absen', onPress: () => doPunch(pic.uri) },
        ]
      );
    } catch (e) {
      Alert.alert('Gagal', 'Tidak dapat mengambil foto.');
    } finally {
      setPhotoLoading(false);
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

      {connectOpen ? (
        <ConnectAbsenCard
          email={connectEmail}
          setEmail={setConnectEmail}
          password={connectPassword}
          setPassword={setConnectPassword}
          loading={connectLoading}
          error={connectError}
          onConnect={doConnect}
        />
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.errorRetry}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {locked ? <LockedCard reason={today?.punch_lock?.reason} onRefresh={onRefresh} /> : null}

      <OfficeCard office={office} allowAnywhere={allowAnywhere} />

      <LocationCard
        locating={locating}
        locError={locError}
        distance={distance}
        radius={office?.radius_m || 100}
        inside={inside}
        allowAnywhere={allowAnywhere}
        onLocate={locate}
      />

      {!locked ? (
        <PunchCard
          today={today}
          punchType={punchType}
          shift={shift}
          inGateOpen={inGateOpen}
          inOpenMin={inOpenMin}
          nowMin={nowMin}
          inside={inside}
          distance={distance}
          radius={office?.radius_m || 100}
          allowAnywhere={allowAnywhere}
          punching={punching}
          cooldownActive={cooldownActive}
          cooldownLeft={cooldown.minutesLeft}
          cooldownMsg={actionState.message}
          hasPhoto={!!photoUri}
          onPunch={doPunch}
        />
      ) : null}

      <PunchLogs logs={today?.punch_logs || []} />

      <CameraModal
        visible={photoOpen}
        loading={photoLoading}
        cameraRef={cameraRef}
        user={user}
        now={now}
        location={location}
        distance={distance}
        radius={office?.radius_m || 100}
        office={office}
        address={address}
        allowAnywhere={allowAnywhere}
        onSnap={snapPhoto}
        onClose={() => setPhotoOpen(false)}
      />

      <Text style={styles.footnote}>
        {allowAnywhere
          ? 'Kamu dapat absen dari lokasi mana pun — posisi tetap direkam saat absen.'
          : 'Verifikasi lokasi radius ' + (office?.radius_m || 100) + ' m dari ' + (office?.name || 'kantor') + '.'}
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

function ConnectAbsenCard({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  onConnect,
}) {
  return (
    <View style={[styles.card, styles.connectCard]}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="link" size={18} color={colors.accentLight} />
        <Text style={styles.cardTitle}>Sambungkan Absen</Text>
      </View>
      <Text style={styles.muted}>
        Sesi absen belum terhubung. Masukkan email &amp; password untuk menyambungkan
        layanan absen.
      </Text>
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="nama@email.com"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.muted}
        secureTextEntry
      />
      {error ? <Text style={styles.connectError}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.connectBtn, loading && styles.punchBtnDisabled]}
        onPress={onConnect}
        disabled={loading}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[colors.accentLight, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.connectBtnGrad}
        >
          <MaterialIcons name="link" size={20} color="#fff" />
          <Text style={styles.connectBtnText}>
            {loading ? 'Menghubungkan...' : 'Sambungkan'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function OfficeCard({ office, allowAnywhere }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="business" size={18} color={colors.accentLight} />
        <Text style={styles.cardTitle}>Kantor</Text>
      </View>
      <Text style={styles.officeName}>{office?.name || '-'}</Text>
      <Text style={styles.officeSub}>
        {allowAnywhere
          ? 'Absen lokasi bebas — dilapangan / mobilisasi'
          : 'Radius absen ' + (office?.radius_m || 100) + ' m'}
      </Text>
    </View>
  );
}

function LocationCard({ locating, locError, distance, radius, inside, allowAnywhere, onLocate }) {
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
              {allowAnywhere
                ? 'Lokasi direkam saat absen'
                : inside
                  ? 'Kamu di dalam area absen'
                  : 'Di luar area kantor'}
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

function PunchCard({ today, punchType, shift, inGateOpen, inOpenMin, inside, distance, radius, allowAnywhere, punching, cooldownActive, cooldownLeft, cooldownMsg, hasPhoto, onPunch }) {
  const attendance = today?.attendance;
  const hasIn = !!attendance?.clock_in;
  const hasOut = !!attendance?.clock_out;
  const gatedIn = punchType === 'in' && !inGateOpen;
  const disabled = !punchType || !inside || punching || gatedIn || cooldownActive;
  const active = !!punchType && inside && !gatedIn && !punching && !cooldownActive;

  const action =
    !punchType
      ? hasOut
        ? 'Presensi Selesai'
        : 'Absensi Selesai'
      : punchType === 'in'
        ? 'Absen Masuk'
        : 'Absen Pulang';

  const icon = !punchType ? 'check' : punchType === 'in' ? 'login' : 'logout';

  const caption = punching
    ? 'Memproses…'
    : cooldownActive
      ? 'Terkunci • ' + cooldownLeft + ' mnt lagi'
      : gatedIn
        ? 'Terbuka pukul ' + fmtClock(inOpenMin) + ' WIB'
        : !inside && distance !== null
          ? allowAnywhere
            ? 'Absen lokasi bebas'
            : 'Di luar radius ' + radius + ' m'
          : hasPhoto
            ? 'Foto bukti siap'
            : 'Ambil foto selfie sebagai bukti';

  const gradColors = active ? [colors.indigo, colors.accent] : [colors.cardAlt, colors.cardAlt];
  const glyphColor = active ? '#fff' : colors.muted;

  const shiftLabel = shift
    ? fmtClock(timeToMin(shift.start_time)) + ' – ' + fmtClock(timeToMin(shift.end_time))
    : null;

  return (
    <View style={styles.punchCard}>
      {shift ? (
        <View style={styles.shiftRow}>
          <MaterialIcons name="schedule" size={15} color={colors.accentLight} />
          <Text style={styles.shiftText}>
            Shift {shift.name || ''}
            {shiftLabel ? '  •  ' + shiftLabel : ''}
          </Text>
        </View>
      ) : null}

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

      {cooldownActive && cooldownMsg ? (
        <View style={styles.cooldownBanner}>
          <MaterialIcons name="lock-clock" size={16} color={colors.yellow} />
          <Text style={styles.cooldownText}>{cooldownMsg}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.punchBtnWrap, disabled && styles.punchBtnWrapDisabled]}
        onPress={onPunch}
        disabled={disabled || punching}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.punchBtnInner}
        >
          <View style={styles.punchBtnRow}>
            <View style={[styles.punchIcon, !active && styles.punchIconMuted]}>
              <MaterialIcons name={icon} size={22} color={glyphColor} />
            </View>
            <View style={styles.punchBtnLabelWrap}>
              <Text style={[styles.punchBtnMain, { color: active ? '#fff' : colors.muted }]}>
                {action}
              </Text>
              <Text style={[styles.punchBtnCaption, { color: active ? 'rgba(255,255,255,0.78)' : colors.muted }]}>
                {caption}
              </Text>
            </View>
            <MaterialIcons
              name="navigate-next"
              size={22}
              color={active ? 'rgba(255,255,255,0.7)' : colors.muted}
            />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function CameraModal({ visible, loading, cameraRef, user, now, location, distance, radius, office, address, allowAnywhere, onSnap, onClose }) {
  const name = user?.fullname || user?.firstname || '';
  const division = user?.division || user?.sub_division || user?.position || '';
  const liveClock = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const lat = location?.coords?.latitude;
  const lng = location?.coords?.longitude;
  const coordText = lat !== undefined && lng !== undefined
    ? lat.toFixed(6) + ', ' + lng.toFixed(6)
    : 'Lokasi aktif';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.cameraOverlay}>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Foto Bukti Diri</Text>
          <TouchableOpacity onPress={onClose} style={styles.cameraClose}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.cameraStage}>
          <CameraView ref={cameraRef} style={styles.camera} facing="front" />

          <View style={styles.cameraInfoOverlay} pointerEvents="none">
            <View style={styles.cameraInfoRow}>
              <MaterialIcons name="person" size={13} color="#fff" />
              <Text style={styles.cameraInfoText}>
                {name || '-'}{division ? ' • ' + division : ''}
              </Text>
            </View>
            <View style={styles.cameraInfoRow}>
              <MaterialIcons name="schedule" size={13} color="#fff" />
              <Text style={styles.cameraInfoText}>{liveClock} WIB</Text>
            </View>
            <View style={styles.cameraInfoRow}>
              <MaterialIcons name="my-location" size={13} color="#fff" />
              <Text style={styles.cameraInfoText}>
                {coordText}
                {distance !== null ? ' • ' + fmtDist(distance) + (allowAnywhere ? ' (bebas)' : ' dari kantor') : ''}
              </Text>
            </View>
            {address ? (
              <View style={styles.cameraInfoRow}>
                <MaterialIcons name="place" size={13} color="#fff" />
                <Text style={styles.cameraInfoText} numberOfLines={2}>{address}</Text>
              </View>
            ) : null}
            <View style={styles.cameraInfoRow}>
              <MaterialIcons name="business" size={13} color="#fff" />
              <Text style={styles.cameraInfoText}>{office?.name || ''}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cameraFooter}>
          <Text style={styles.cameraHint}>
            Posisikan wajah di tengah, dalam pencahayaan cukup. Foto langsung dari kamera, bukan galeri.
          </Text>
          <TouchableOpacity
            style={[styles.cameraBtn, loading && styles.cameraBtnDisabled]}
            onPress={onSnap}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <MaterialIcons name="camera-alt" size={30} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 13,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectCard: {
    gap: 10,
  },
  connectError: {
    color: colors.red,
    fontSize: 12,
  },
  connectBtn: {
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  connectBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
  },
  connectBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
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
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
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
  cooldownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.yellow + '1a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.yellow + '55',
  },
  cooldownText: {
    color: colors.text,
    fontSize: 12,
    flex: 1,
  },
  punchBtnWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  punchBtnWrapDisabled: {
    opacity: 1,
  },
  punchBtnInner: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  punchBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  punchIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  punchIconMuted: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  punchBtnLabelWrap: {
    flex: 1,
    gap: 2,
  },
  punchBtnMain: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  punchBtnCaption: {
    fontSize: 11.5,
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
  cameraOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cameraClose: {
    padding: 4,
  },
  cameraStage: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraInfoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cameraInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  cameraInfoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  cameraFooter: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 14,
  },
  cameraHint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  cameraBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  cameraBtnDisabled: {
    opacity: 0.6,
  },
});
