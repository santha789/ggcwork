import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Audio from 'expo-audio';
import { htOptions, htSetEnabled, htStream, htBroadcast } from '../htApi';
import { Loading, Error } from '../components';
import { colors } from '../theme';
import { fmtDate } from '../datefmt';

const MAX_RECORD_MS = 15000;
const MIN_RECORD_MS = 800;
const POLL_MS = 2500;

function relTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 10) return 'Baru saja';
  if (diff < 60) return Math.floor(diff / 10) * 10 + ' detik lalu';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  return fmtDate(date, { month: 'short' });
}

function fmtDur(ms) {
  const s = Math.max(1, Math.round((ms || 0) / 1000));
  return s + ' dtk';
}

export default function HtScreen({ user }) {
  const [options, setOptions] = useState(null);
  const [segments, setSegments] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // PTT state
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [sending, setSending] = useState(false);
  const recordStartRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recorderRef = useRef(null);

  // Target picker
  const [targets, setTargets] = useState({ all: true, sub_division_ids: [], employee_types: [], user_ids: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subFilter, setSubFilter] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Playback
  const [playingId, setPlayingId] = useState(null);
  const playerRef = useRef(null);
  const playingIdRef = useRef(null);
  const setPlaying = (id) => {
    playingIdRef.current = id;
    setPlayingId(id);
  };

  const afterRef = useRef(0);
  const pollRef = useRef(null);

  const loadOptions = useCallback(async () => {
    try {
      const d = await htOptions();
      setOptions(d);
      setEnabled(!!d.ht_enabled);
    } catch (e) {
      if (e?.unauthorized) setError(e.message);
    }
  }, []);

  const bumpSegments = useCallback((list) => {
    setSegments((prev) => {
      const seen = new Set(prev.map((s) => s.id));
      const fresh = list.filter((s) => !seen.has(s.id));
      if (fresh.length) {
        const maxId = Math.max(...fresh.map((s) => s.id));
        afterRef.current = Math.max(afterRef.current, maxId);
        return [...fresh, ...prev];
      }
      return prev;
    });
  }, []);

  const syncStream = useCallback(async (first) => {
    try {
      const d = await htStream(afterRef.current);
      setEnabled(!!d.ht_enabled);
      bumpSegments(d.segments || []);
    } catch (e) {
      // ignore; polling terus
    } finally {
      if (first) setLoading(false);
    }
  }, [bumpSegments]);

  useEffect(() => {
    loadOptions();
    syncStream(true);
  }, [loadOptions, syncStream]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => syncStream(false), POLL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [syncStream]);

  // Audio mode: biarkan audio tetap aktif saat app dibackground.
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: true,
    }).catch(() => {});
  }, []);

  async function toggleEnabled(next) {
    setEnabled(next);
    try {
      const d = await htSetEnabled(next);
      setEnabled(!!d.ht_enabled);
    } catch (e) {
      setEnabled(!next);
      Alert.alert('Gagal', e?.message || 'Tidak dapat mengubah status HT.');
    }
  }

  async function ensureMicPermission() {
    try {
      const perm = await Audio.requestRecordingPermissionsAsync();
      if (perm && perm.granted) return true;
    } catch (e) {}
    return false;
  }

  async function startRecord() {
    if (recording || sending) return;
    const ok = await ensureMicPermission();
    if (!ok) {
      Alert.alert('Izin Mikrofon', 'Aktifkan izin mikrofon untuk berbicara via HT.');
      return;
    }
    try {
      const rec = new Audio.AudioModule.AudioRecorder(Audio.RecordingPresets.HIGH_QUALITY);
      recorderRef.current = rec;
      await rec.prepareToRecordAsync?.().catch(() => {});
      rec.record();
      setRecording(true);
      setRecordMs(0);
      recordStartRef.current = Date.now();
      recordTimerRef.current = setInterval(() => {
        const ms = Date.now() - recordStartRef.current;
        setRecordMs(ms);
        if (ms >= MAX_RECORD_MS) stopRecord();
      }, 100);
    } catch (e) {
      Alert.alert('Rekam Gagal', e?.message || 'Tidak dapat memulai rekaman.');
    }
  }

  async function stopRecord() {
    if (!recording) return;
    const rec = recorderRef.current;
    const start = recordStartRef.current;
    setRecording(false);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    if (!rec) return;

    try {
      await rec.stop();
    } catch (e) {}

    const ms = Date.now() - start;
    if (ms < MIN_RECORD_MS) {
      Alert.alert('Terlalu Pendek', 'Tahan tombol minimal 1 detik untuk berbicara.');
      rec.release?.();
      return;
    }
    await sendSegment(rec, ms);
  }

  async function sendSegment(rec, ms) {
    const uri = rec.uri;
    if (!uri) {
      Alert.alert('Gagal', 'Audio tidak tersimpan.');
      rec.release?.();
      return;
    }
    setSending(true);
    try {
      const data = await htBroadcast({
        uri,
        mimeType: 'audio/mp4',
        durationMs: ms,
        audience: targets,
      });
      if (data?.segment) {
        const seg = Array.isArray(segments) ? segments : [];
        if (!seg.some((s) => s.id === data.segment.id)) {
          setSegments([data.segment, ...seg]);
        }
        afterRef.current = Math.max(afterRef.current, data.segment.id);
      }
    } catch (e) {
      Alert.alert('Kirim Gagal', e?.message || 'Tidak dapat mengirim siaran HT.');
    } finally {
      setSending(false);
      rec.release?.();
    }
  }

  async function playSegment(seg) {
    if (playingId === seg.id && playerRef.current?.playing) {
      playerRef.current.pause();
      setPlaying(null);
      return;
    }
    try {
      if (playerRef.current) {
        playerRef.current.release?.();
        playerRef.current = null;
      }
      const player = new Audio.AudioModule.AudioPlayer({ uri: seg.audio_url }, 500, true, 10000);
      playerRef.current = player;
      setPlaying(seg.id);
      player.play();
      const idRef = seg.id;
      const check = setInterval(() => {
        const cur = playerRef.current;
        if (!cur || cur !== player) {
          clearInterval(check);
          return;
        }
        const status = cur.currentStatus;
        if (status?.didJustFinish || (cur.playing === false && cur.isLoaded && !cur.paused)) {
          clearInterval(check);
          player.release?.();
          if (playerRef.current === player) playerRef.current = null;
          if (playingIdRef.current === idRef) setPlaying(null);
        }
      }, 400);
    } catch (e) {
      setPlaying(null);
    }
  }

  function renderTargetChip(label, icon, onPress, extraStyle) {
    return (
      <TouchableOpacity style={[styles.targetChip, extraStyle]} onPress={onPress} activeOpacity={0.8}>
        <MaterialIcons name={icon} size={16} color={extraStyle ? '#fff' : colors.muted} />
        <Text style={[styles.targetChipText, extraStyle && { color: '#fff' }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    return (
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.title}>Siaran HT</Text>
            <Text style={styles.subtitle}>Radio karyawan realtime • tekan-tahan untuk bicara</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={[styles.enabledPill, enabled ? styles.enabledPillOn : null]}>
              <Text style={[styles.enabledPillText, enabled && { color: '#fff' }]}>
                {enabled ? 'AKTIF' : 'NONAKTIF'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, { backgroundColor: enabled ? colors.accent : colors.muted }]}
              onPress={() => toggleEnabled(!enabled)}
              activeOpacity={0.8}
            >
              <MaterialIcons name={enabled ? 'volume-up' : 'volume-off'} size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.targetRow}>
          {renderTargetChip(
            targets.all
              ? 'Semua Karyawan'
              : targetCountLabel(),
            targets.all ? 'public' : 'filter-list',
            () => setPickerOpen(!pickerOpen),
            pickerOpen ? styles.chipActive : null
          )}
        </View>

        {pickerOpen ? (
          <View style={styles.picker}>
            {renderTargetChip(
              targets.all ? '1. Semua' : '1. Semua', 'check-circle', () => {
                setTargets({ all: true, sub_division_ids: [], employee_types: [], user_ids: [] });
              },
              targets.all ? styles.chipActive : null
            )}
            <Text style={styles.pickerLabel}>2. Subdivisi (opsional)</Text>
            <View style={styles.chipWrap}>
              {(options?.sub_divisions || []).map((sd) => {
                const sel = targets.sub_division_ids.includes(sd.id);
                return renderTargetChip(
                  sd.name, sel ? 'check-box' : 'check-box-outline-blank',
                  () => {
                    if (targets.all) {
                      setTargets({ all: false, sub_division_ids: [sd.id], employee_types: [], user_ids: [] });
                      return;
                    }
                    const list = targets.sub_division_ids.includes(sd.id)
                      ? targets.sub_division_ids.filter((x) => x !== sd.id)
                      : [...targets.sub_division_ids, sd.id];
                    setTargets({ ...targets, sub_division_ids: list, all: false });
                  },
                  sel ? styles.chipActive : null
                );
              })}
            </View>
            <Text style={styles.pickerLabel}>3. Jenis Karyawan (opsional)</Text>
            <View style={styles.chipWrap}>
              {(options?.employee_types || []).map((et) => {
                const sel = targets.employee_types.includes(et);
                return renderTargetChip(
                  et, sel ? 'check-box' : 'check-box-outline-blank',
                  () => {
                    if (targets.all) {
                      setTargets({ all: false, sub_division_ids: [], employee_types: [et], user_ids: [] });
                      return;
                    }
                    const list = targets.employee_types.includes(et)
                      ? targets.employee_types.filter((x) => x !== et)
                      : [...targets.employee_types, et];
                    setTargets({ ...targets, employee_types: list, all: false });
                  },
                  sel ? styles.chipActive : null
                );
              })}
            </View>
            <Text style={styles.pickerLabel}>4. User Tertentu (opsional)</Text>
            <View style={styles.searchRow}>
              <MaterialIcons name="search" size={18} color={colors.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Ketik nama untuk menandai…"
                placeholderTextColor={colors.muted}
                value={userSearch}
                onChangeText={(t) => {
                  setUserSearch(t);
                  if (!t.trim()) { setSearchResults([]); return; }
                  // filter dari options users
                  const q = t.trim().toLowerCase();
                  const res = (options?.users || []).filter(
                    (u) => (u.fullname || '').toLowerCase().includes(q)
                  );
                  setSearchResults(res.slice(0, 8));
                }}
              />
            </View>
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((u) => {
                  const sel = targets.user_ids.includes(u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.searchResultRow}
                      onPress={() => {
                        if (targets.all) {
                          setTargets({ all: false, sub_division_ids: [], employee_types: [], user_ids: [u.id] });
                          return;
                        }
                        const list = targets.user_ids.includes(u.id)
                          ? targets.user_ids.filter((x) => x !== u.id)
                          : [...targets.user_ids, u.id];
                        setTargets({ ...targets, user_ids: list, all: false });
                      }}
                    >
                      <MaterialIcons
                        name={sel ? 'check-circle' : 'add-circle-outline'}
                        size={18}
                        color={sel ? colors.accent : colors.muted}
                      />
                      <Text style={[styles.searchResultName, sel && { color: colors.accent }]}>
                        {u.fullname}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {targets.user_ids.length > 0 && (
              <View style={styles.chipWrap}>
                {targets.user_ids.map((uid) => {
                  const u = (options?.users || []).find((x) => x.id === uid);
                  return renderTargetChip(
                    u?.fullname || '#' + uid, 'person', () => {
                      setTargets({
                        ...targets,
                        user_ids: targets.user_ids.filter((x) => x !== uid),
                        all: false,
                      });
                    },
                    styles.chipActive
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  function targetCountLabel() {
    const n = targets.sub_division_ids.length + targets.employee_types.length + targets.user_ids.length;
    return n + ' target';
  }

  function renderPTT() {
    const disabled = !enabled || sending;
    return (
      <View style={styles.pttWrap}>
        {recording && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>MEREKAM {fmtDur(recordMs)}</Text>
          </View>
        )}
        {sending && <Text style={styles.sendingText}>Mengirim…</Text>}
        <TouchableOpacity
          style={[styles.pttBtn, (recording && styles.pttBtnRec) || (disabled && styles.pttBtnIdle)]}
          onPressIn={startRecord}
          onPressOut={stopRecord}
          disabled={!enabled || sending}
          activeOpacity={0.9}
        >
          <MaterialIcons name={recording ? 'mic' : 'mic-none'} size={44} color="#fff" />
          <Text style={styles.pttLabel}>
            {recording
              ? 'Lepas untuk kirim'
              : disabled
              ? enabled ? 'Mengirim…' : 'HT nonaktif — nyalakan untuk bicara'
              : 'Tekan & tahan untuk bicara'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.pttHint}>Maksimal 15 detik per siaran • audio diputar ke {targetCountLabel()}</Text>
      </View>
    );
  }

  function renderSegment({ item }) {
    const isPlaying = playingId === item.id;
    return (
      <View style={styles.segCard}>
        <TouchableOpacity
          style={styles.playBtn}
          onPress={() => playSegment(item)}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name={isPlaying ? 'stop' : 'play-arrow'}
            size={26}
            color="#fff"
          />
        </TouchableOpacity>
        <View style={styles.segBody}>
          <View style={styles.segHead}>
            <Text style={styles.segName} numberOfLines={1}>
              {item.sender_name}
              {item.sender_sub_division ? ' · ' + item.sender_sub_division : ''}
            </Text>
            {item.is_mine && <Text style={styles.segMine}>Kamu</Text>}
          </View>
          <Text style={styles.segMeta}>
            {fmtDur(item.duration_ms)} {'  •  '}
            {relTime(item.created_at)}
          </Text>
        </View>
        <MaterialIcons name="graphic-eq" size={18} color={isPlaying ? colors.accent : colors.muted} />
      </View>
    );
  }

  if (error) return <Error message={error} onRetry={() => { setError(null); loadOptions(); }} />;

  return (
    <View style={styles.screen}>
      {renderHeader()}
      <FlatList
        style={styles.list}
        data={segments}
        keyExtractor={(s) => String(s.id)}
        renderItem={renderSegment}
        ListHeaderComponent={<Text style={styles.listLabel}>Siaran terbaru</Text>}
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : (
            <View style={styles.empty}>
              <MaterialIcons name="multitrack-audio" size={42} color={colors.border} />
              <Text style={styles.emptyText}>
                Belum ada siaran. Tekan & tahan tombol di bawah untuk bicara.
              </Text>
            </View>
          )
        }
        contentContainerStyle={segments.length ? { paddingBottom: 260 } : { flexGrow: 1, paddingBottom: 260 }}
      />
      {renderPTT()}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontWeight: 'bold', fontSize: 18 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  enabledPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  enabledPillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  enabledPillText: { color: colors.muted, fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },
  toggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetRow: { flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' },
  targetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  targetChipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  picker: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, padding: 0 },
  searchResults: {
    marginTop: 8,
    backgroundColor: colors.card,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchResultName: { color: colors.text, fontSize: 13 },
  list: { flex: 1 },
  listLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  segCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  playBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBody: { flex: 1 },
  segHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segName: { color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  segMine: {
    color: colors.accentLight,
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.accentLight + '44',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  segMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  pttWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 22,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.red + '22',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  recText: { color: colors.red, fontSize: 11, fontWeight: '700' },
  sendingText: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  pttBtn: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: colors.accent,
    borderWidth: 6,
    borderColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  pttBtnRec: {
    backgroundColor: colors.red,
    borderColor: '#f87171',
    shadowColor: colors.red,
  },
  pttBtnIdle: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  pttLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  pttHint: { color: colors.muted, fontSize: 11, marginTop: 10, textAlign: 'center' },
});