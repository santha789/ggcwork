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
import * as FileSystem from 'expo-file-system';
import { htOptions, htSetEnabled, htWsUrl } from '../htApi';
import { getStoredToken } from '../attendanceApi';
import { Loading, Error } from '../components';
import { colors } from '../theme';

const CHUNK_MS = 1200;
const MAX_TALK_MS = 30000;
const RECONNECT_MS = 3000;
const KEEPALIVE_MS = 15000;

function nowLabel() {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HtScreen({ user }) {
  const [options, setOptions] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [conn, setConn] = useState('off'); // off|connecting|open
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // PTT
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const recReadyRef = useRef(false);
  const talkingRef = useRef(false);
  const talkSeqRef = useRef(0);
  const recordTimerRef = useRef(null);
  const recStartRef = useRef(null);
  const chunkRecorderRef = useRef(null);

  // WebSocket
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const keepAliveRef = useRef(null);
  const [wgLive, setWgLive] = useState([]); // sedang bicara {user_id, fullname}
  const wgLiveRef = useRef([]);

  // Target picker
  const [targets, setTargets] = useState({ all: true, sub_division_ids: [], employee_types: [], user_ids: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subFilter, setSubFilter] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Incoming stream
  const [incoming, setIncoming] = useState([]);
  const incomingRef = useRef([]);
  const playerRef = useRef(null);
  const playSeq = useRef(0);
  const autoPlayRef = useRef(true);
  const [autoPlay, setAutoPlay] = useState(true);

  const sendEnabledRef = useRef(true);
  const sendTargetsRef = useRef(targets);
  sendTargetsRef.current = targets;
  sendEnabledRef.current = enabled;
  autoPlayRef.current = autoPlay;

  const setWgLiveSafe = (next) => {
    wgLiveRef.current = next;
    setWgLive(next);
  };

  // ---------- WebSocket lifecycle ----------
  const sendWs = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }, []);

  const pushConfig = useCallback(() => {
    if (!sendWs({ type: 'config', enabled: sendEnabledRef.current, audience: sendTargetsRef.current })) return;
    setTimeout(() => sendWs({ type: 'join' }), 60);
  }, [sendWs]);

  const connect = useCallback(async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    setConn('connecting');
    let token = null;
    try {
      token = await getStoredToken();
    } catch (e) {}
    if (!token) {
      setConn('off');
      return;
    }

    const ws = new WebSocket(htWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConn('open');
      sendWs({ type: 'auth', token });
      setTimeout(() => sendWs({ type: 'config', enabled: sendEnabledRef.current, audience: sendTargetsRef.current }), 50);
      setTimeout(() => sendWs({ type: 'join' }), 120);
    };
    ws.onmessage = (ev) => {
      let m = null;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      handleWsMessage(m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      setConn('off');
      setWgLiveSafe([]);
      if (!reconnectRef.current) {
        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null;
          connect();
        }, RECONNECT_MS);
      }
    };
  }, [sendWs]);

  function handleWsMessage(m) {
    switch (m.type) {
      case 'ready':
        pushConfig();
        break;
      case 'ack':
        sendWs({ type: 'join' });
        break;
      case 'joined':
        setWgLiveSafe(m.talkers || []);
        break;
      case 'talk':
        updateTalker(m);
        break;
      case 'audio':
        enqueueIncoming(m);
        break;
      case 'pong':
        break;
      default:
        break;
    }
  }

  function updateTalker(m) {
    const live = wgLiveRef.current.slice();
    const idx = live.findIndex((x) => x.user_id === m.user_id);
    if (m.state) {
      if (idx < 0) live.push({ user_id: m.user_id, fullname: m.fullname });
    } else {
      if (idx >= 0) live.splice(idx, 1);
    }
    setWgLiveSafe(live);
  }

  function enqueueIncoming(m) {
    const item = {
      key: ++playSeq.current,
      user_id: m.user_id,
      fullname: m.fullname,
      data: m.data,
      dur: m.dur,
      at: nowLabel(),
      seq: m.seq,
    };
    incomingRef.current = [...incomingRef.current, item].slice(-40);
    setIncoming(incomingRef.current);
    if (autoPlayRef.current) playAudioItem(item);
  }

  const playAudioItem = useCallback(async (item) => {
    try {
      const tmp = FileSystem.cacheDirectory + 'ht_' + item.key + '.m4a';
      await FileSystem.writeAsStringAsync(tmp, item.data, { encoding: FileSystem.EncodingType.Base64 });
      if (playerRef.current) {
        playerRef.current.release?.();
      }
      const player = new Audio.AudioModule.AudioPlayer({ uri: tmp }, 0, false, 0);
      playerRef.current = player;
      player.play();

      const cur = playerRef.current;
      const check = setInterval(() => {
        const p = playerRef.current;
        if (!p || p !== player) {
          clearInterval(check);
          return;
        }
        const st = p.currentStatus;
        if (st?.didJustFinish || (p.playing === false && p.isLoaded && !p.paused)) {
          clearInterval(check);
          p.release?.();
          if (playerRef.current === p) playerRef.current = null;
          FileSystem.deleteAsync(tmp).catch(() => {});
        }
      }, 300);
    } catch (e) {}
  }, []);

  // ---------- Load & lifecycle ----------
  const loadOptions = useCallback(async () => {
    try {
      const d = await htOptions();
      setOptions(d);
      setEnabled(!!d.ht_enabled);
      sendEnabledRef.current = !!d.ht_enabled;
    } catch (e) {
      if (e?.unauthorized) setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
    connect();
  }, [loadOptions, connect]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: true,
    }).catch(() => {});
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (wsRef.current) {
        stopTalkNow();
        try {
          wsRef.current.close();
        } catch (e) {}
      }
      if (playerRef.current) {
        playerRef.current.release?.();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keepalive + reconnect guard
  useEffect(() => {
    if (conn === 'open') {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      keepAliveRef.current = setInterval(() => sendWs({ type: 'ping' }), KEEPALIVE_MS);
    }
    return () => {
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
    };
  }, [conn, sendWs]);

  async function toggleEnabled(next) {
    setEnabled(next);
    sendEnabledRef.current = next;
    try {
      const d = await htSetEnabled(next);
      setEnabled(!!d.ht_enabled);
      sendEnabledRef.current = !!d.ht_enabled;
    } catch (e) {
      setEnabled(!next);
      sendEnabledRef.current = !next;
      Alert.alert('Gagal', e?.message || 'Tidak dapat mengubah status HT.');
      return;
    }
    if (!next && talkingRef.current) stopTalkNow();
    setTimeout(() => pushConfig(), 100);
  }

  async function ensureMicPermission() {
    try {
      const perm = await Audio.requestRecordingPermissionsAsync();
      if (perm && perm.granted) return true;
    } catch (e) {}
    return false;
  }

  // ---------- PTT: chunked realtime ----------
  async function startRecord() {
    if (!enabled || recording || conn !== 'open') {
      if (conn !== 'open') Alert.alert('Menghubungkan', 'Pindah HT sedang menyambung ulang. Coba lagi sebentar.');
      return;
    }
    const ok = await ensureMicPermission();
    if (!ok) {
      Alert.alert('Izin Mikrofon', 'Aktifkan izin mikrofon untuk berbicara via HT.');
      return;
    }
    setRecording(true);
    setRecordMs(0);
    recStartRef.current = Date.now();
    talkingRef.current = true;
    if (!sendWs({ type: 'start_talk' })) {
      // fallback: tetap lanjut; server akan abort chunk kalau tak joined
    }
    startChunkLoop();
    recordTimerRef.current = setInterval(() => {
      const ms = Date.now() - recStartRef.current;
      setRecordMs(ms);
      if (ms >= MAX_TALK_MS) stopRecord();
    }, 100);
  }

  async function startChunk() {
    try {
      const rec = new Audio.AudioModule.AudioRecorder(Audio.RecordingPresets.HIGH_QUALITY);
      chunkRecorderRef.current = rec;
      await rec.prepareToRecordAsync?.().catch(() => {});
      rec.record();
      recReadyRef.current = true;
    } catch (e) {
      recReadyRef.current = false;
    }
  }

  async function cutChunk() {
    const rec = chunkRecorderRef.current;
    if (!rec) return;
    recReadyRef.current = false;
    try {
      await rec.stop();
    } catch (e) {}
    const uri = rec.uri;
    rec.release?.();
    chunkRecorderRef.current = null;
    if (!uri) return;
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const dur = Math.max(1, CHUNK_MS);
      talkSeqRef.current += 1;
      sendWs({ type: 'audio', seq: talkSeqRef.current, dur, data: b64 });
      FileSystem.deleteAsync(uri).catch(() => {});
    } catch (e) {}
  }

  function startChunkLoop() {
    if (!talkingRef.current) return;
    startChunk();
    setTimeout(() => {
      if (!talkingRef.current) return;
      cutChunk().then(() => startChunkLoop());
    }, CHUNK_MS);
  }

  async function stopRecord() {
    if (!recording) return;
    const start = recStartRef.current;
    setRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    talkingRef.current = false;
    const ms = Date.now() - start;
    if (ms < 400) {
      try {
        if (chunkRecorderRef.current) {
          await chunkRecorderRef.current.stop().catch(() => {});
          chunkRecorderRef.current.release?.();
          chunkRecorderRef.current = null;
        }
      } catch (e) {}
      sendWs({ type: 'stop_talk' });
      return;
    }
    await cutChunk();
    sendWs({ type: 'stop_talk' });
  }

  function stopTalkNow() {
    talkingRef.current = false;
    setRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (chunkRecorderRef.current) {
      chunkRecorderRef.current.stop?.().catch(() => {});
      chunkRecorderRef.current.release?.();
      chunkRecorderRef.current = null;
    }
    sendWs({ type: 'stop_talk' });
  }

  // ---------- Target picker UI ----------
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

  function targetCountLabel() {
    const n = targets.sub_division_ids.length + targets.employee_types.length + targets.user_ids.length;
    return n + ' target';
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
            <View style={[styles.connPill, conn === 'open' ? styles.connOn : null]}>
              <View style={[styles.connDot, conn === 'open' ? styles.connDotOn : null]} />
              <Text style={[styles.connText, conn === 'open' && { color: colors.accent }]}>
                {conn === 'open' ? 'ON AIR' : conn === 'connecting' ? 'MENYAMBUNG' : 'PUTUS'}
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
            targets.all ? 'Semua Karyawan' : targetCountLabel(),
            targets.all ? 'public' : 'filter-list',
            () => setPickerOpen(!pickerOpen),
            pickerOpen ? styles.chipActive : null
          )}
          <TouchableOpacity
            style={[styles.autoPlayBtn, { borderColor: autoPlay ? colors.accent + '66' : colors.border }]}
            onPress={() => setAutoPlay(!autoPlay)}
            activeOpacity={0.8}
          >
            <MaterialIcons name={autoPlay ? 'play-circle-filled' : 'play-circle-outline'} size={18} color={autoPlay ? colors.accent : colors.muted} />
            <Text style={[styles.autoPlayText, { color: autoPlay ? colors.accent : colors.muted }]}>Auto</Text>
          </TouchableOpacity>
        </View>

        {wgLive.length > 0 && (
          <View style={styles.liveBanner}>
            <MaterialIcons name="graphic-eq" size={18} color="#fff" />
            <Text style={styles.liveText} numberOfLines={1}>
              {wgLive.map((x) => x.fullname || 'Seseorang').join(', ')} sedang bicara…
            </Text>
          </View>
        )}

        {pickerOpen ? (
          <View style={styles.picker}>
            <Text style={styles.pickerLabel}>Audience (untuk siaran-mu)</Text>
            {renderTargetChip(
              '1. Semua',
              'check-circle',
              () => setTargets({ all: true, sub_division_ids: [], employee_types: [], user_ids: [] }),
              targets.all ? styles.chipActive : null
            )}
            <Text style={styles.pickerLabel}>2. Subdivisi (opsional)</Text>
            <View style={styles.chipWrap}>
              {(options?.sub_divisions || []).map((sd) => {
                const sel = targets.sub_division_ids.includes(sd.id);
                return renderTargetChip(
                  sd.name,
                  sel ? 'check-box' : 'check-box-outline-blank',
                  () => {
                    setTargets((t) => {
                      const list = t.sub_division_ids.includes(sd.id)
                        ? t.sub_division_ids.filter((x) => x !== sd.id)
                        : [...t.sub_division_ids, sd.id];
                      return { ...t, all: false, sub_division_ids: list };
                    });
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
                  et,
                  sel ? 'check-box' : 'check-box-outline-blank',
                  () => {
                    setTargets((t) => {
                      const list = t.employee_types.includes(et)
                        ? t.employee_types.filter((x) => x !== et)
                        : [...t.employee_types, et];
                      return { ...t, all: false, employee_types: list };
                    });
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
                  if (!t.trim()) {
                    setSearchResults([]);
                    return;
                  }
                  const q = t.trim().toLowerCase();
                  const res = (options?.users || []).filter((u) => (u.fullname || '').toLowerCase().includes(q));
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
                        setTargets((t) => {
                          const list = t.user_ids.includes(u.id)
                            ? t.user_ids.filter((x) => x !== u.id)
                            : [...t.user_ids, u.id];
                          return { ...t, all: false, user_ids: list };
                        });
                        setUserSearch('');
                        setSearchResults([]);
                      }}
                    >
                      <MaterialIcons name={sel ? 'check-circle' : 'add-circle-outline'} size={18} color={sel ? colors.accent : colors.muted} />
                      <Text style={[styles.searchResultName, sel && { color: colors.accent }]}>{u.fullname}</Text>
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
                    u?.fullname || '#' + uid,
                    'person',
                    () => setTargets((t) => ({ ...t, user_ids: t.user_ids.filter((x) => x !== uid), all: false })),
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

  function renderPTT() {
    const disabled = !enabled;
    return (
      <View style={styles.pttWrap}>
        {recording && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>ON AIR {Math.max(1, Math.round(recordMs / 1000))}s</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.pttBtn, (recording && styles.pttBtnRec) || (disabled && styles.pttBtnIdle)]}
          onPressIn={startRecord}
          onPressOut={stopRecord}
          disabled={!enabled}
          activeOpacity={0.9}
        >
          <MaterialIcons name={recording ? 'mic' : 'mic-none'} size={44} color="#fff" />
          <Text style={styles.pttLabel}>
            {recording
              ? 'Lepas untuk berhenti'
              : disabled
              ? 'HT nonaktif — nyalakan untuk bicara'
              : conn !== 'open'
              ? 'Menyambung…'
              : 'Tekan & tahan untuk bicara'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.pttHint}>
          Realtime • disiarkan ke {targetCountLabel()} • maksimal 30 detik per siaran
        </Text>
      </View>
    );
  }

  function renderStream({ item }) {
    return (
      <View style={styles.segCard}>
        <MaterialIcons name="graphic-eq" size={16} color={colors.accent} />
        <View style={styles.segBody}>
          <Text style={styles.segName} numberOfLines={1}>
            {item.fullname || 'Seseorang'}
          </Text>
          <Text style={styles.segMeta}>{item.at} • chunk #{item.seq}</Text>
        </View>
      </View>
    );
  }

  if (error) return <Error message={error} onRetry={() => { setError(null); loadOptions(); }} />;

  return (
    <View style={styles.screen}>
      {renderHeader()}
      <FlatList
        style={styles.list}
        data={incoming}
        keyExtractor={(s) => String(s.key)}
        renderItem={renderStream}
        ListHeaderComponent={
          <Text style={styles.listLabel}>
            Umpan realtime {conn !== 'open' ? '• ' + conn : ''}
          </Text>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : (
            <View style={styles.empty}>
              <MaterialIcons name="multitrack-audio" size={42} color={colors.border} />
              <Text style={styles.emptyText}>
                Belum ada suara masuk. Tekan & tahan tombol di bawah untuk menyiarkan.
              </Text>
            </View>
          )
        }
        contentContainerStyle={incoming.length ? { paddingBottom: 260 } : { flexGrow: 1, paddingBottom: 260 }}
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
  connPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connOn: { borderColor: colors.accent + '55' },
  connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted },
  connDotOn: { backgroundColor: colors.accent },
  connText: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  toggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetRow: { flexDirection: 'row', marginTop: 12, flexWrap: 'wrap', gap: 8 },
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
  autoPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
  },
  autoPlayText: { fontSize: 11, fontWeight: '700' },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveText: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
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
  segBody: { flex: 1 },
  segName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  segMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
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
  pttBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
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
  pttBtnRec: { backgroundColor: colors.red, borderColor: '#f87171', shadowColor: colors.red },
  pttBtnIdle: { backgroundColor: colors.muted, borderColor: colors.border, shadowOpacity: 0, elevation: 0 },
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