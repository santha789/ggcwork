import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Audio from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { htOptions, htSetEnabled, htBroadcast } from '../htApi';
import {
  subscribeHt,
  getHtState,
  setHtEnabled,
  setHtAutoPlay,
  setHtTargets,
  setHtTalking,
  sendWsMessage,
  playAudio,
  initHtService,
  connectHt,
  reconnectHt,
} from '../services/htManager';
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


function concatArrayBuffers(buffers) {
  let totalLength = 0;
  for (let i = 0; i < buffers.length; i++) {
    totalLength += (buffers[i]?.byteLength || 0);
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    const b = buffers[i];
    if (b && b.byteLength > 0) {
      result.set(new Uint8Array(b), offset);
      offset += b.byteLength;
    }
  }
  return result.buffer;
}

function pcmToWavBase64(pcmBuffer, sampleRate = 16000, numChannels = 1) {
  const pcmBytes = new Uint8Array(pcmBuffer);
  const dataSize = pcmBytes.length;
  if (dataSize === 0) return '';
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);

  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcmBytes);

  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function HtScreen({ user, onBack }) {
  const [options, setOptions] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [conn, setConn] = useState('off'); // off|connecting|open
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [featureAvailable, setFeatureAvailable] = useState(true);

  // PTT
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const talkingRef = useRef(false);
  const talkSeqRef = useRef(0);
  const recordTimerRef = useRef(null);
  const recStartRef = useRef(null);
  const chunkRecorderRef = useRef(null);
  const chunkBusyRef = useRef(false);
  const streamRef = useRef(null);
  const streamSubRef = useRef(null);
  const pcmListRef = useRef([]);
  const streamTimerRef = useRef(null);
  const streamSeqRef = useRef(0);
  const myUserIdRef = useRef(null);

  const [wgLive, setWgLive] = useState([]); // sedang bicara {user_id, fullname}
  const wgLiveRef = useRef([]);

  // Target picker
  const [targets, setTargets] = useState({ all: true, sub_division_ids: [], employee_types: [], user_ids: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState('semua');
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Incoming stream
  const [incoming, setIncoming] = useState([]);
  const [autoPlay, setAutoPlay] = useState(true);

  const sendEnabledRef = useRef(true);
  const sendTargetsRef = useRef(targets);
  sendTargetsRef.current = targets;
  sendEnabledRef.current = enabled;

  const setWgLiveSafe = (next) => {
    wgLiveRef.current = next;
    setWgLive(next);
  };

  const flushStreamChunk = useCallback((sampleRate = 16000) => {
    if (pcmListRef.current.length === 0) return;
    const buffers = pcmListRef.current;
    pcmListRef.current = [];

    const pcm = concatArrayBuffers(buffers);
    if (pcm.byteLength < 320) return;

    const b64 = pcmToWavBase64(pcm, sampleRate, 1);
    if (b64) {
      streamSeqRef.current += 1;
      const dur = Math.round((pcm.byteLength / (sampleRate * 2)) * 1000);
      sendWsMessage({
        type: 'audio',
        seq: streamSeqRef.current,
        dur,
        data: b64,
      });
    }
  }, []);

  // ---------- Load & lifecycle ----------
  const loadOptions = useCallback(async () => {
    try {
      const d = await htOptions();
      if (d?.current_user_id) myUserIdRef.current = d.current_user_id;
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
    if (user) {
      initHtService(user).catch(() => {});
    } else {
      connectHt().catch(() => {});
    }
    const unsub = subscribeHt((st) => {
      setConn(st.conn);
      setWgLiveSafe(st.talkers);
      setIncoming(st.incoming);
      setEnabled(st.enabled);
      setAutoPlay(st.autoPlay);
    });
    return () => unsub();
  }, [loadOptions, user]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      stopTalkNow();
    };
  }, []);

  async function toggleEnabled(next) {
    setHtEnabled(next);
    setEnabled(next);
    sendEnabledRef.current = next;
    try {
      const d = await htSetEnabled(next);
      setEnabled(!!d.ht_enabled);
      sendEnabledRef.current = !!d.ht_enabled;
      setHtEnabled(!!d.ht_enabled);
    } catch (e) {
      setEnabled(!next);
      sendEnabledRef.current = !next;
      setHtEnabled(!next);
      Alert.alert('Gagal', e?.message || 'Tidak dapat mengubah status HT.');
    }
    if (!next && talkingRef.current) stopTalkNow();
  }

  async function ensureMicPermission() {
    try {
      const perm = await Audio.requestRecordingPermissionsAsync();
      if (perm && perm.granted) return true;
    } catch (e) {}
    return false;
  }

  // ---------- PTT: Realtime Streaming Audio ----------
  async function startRecord() {
    if (!enabled || recording || conn !== 'open') {
      if (!enabled) {
        Alert.alert('HT Off Air', 'Nyalakan tombol ON AIR di atas untuk berbicara.');
        return;
      }
      if (conn !== 'open') {
        Alert.alert(
          'Menghubungkan ke Radio',
          'HT sedang menyambung ke server. Ingin menghubungkan ulang sekarang?',
          [
            { text: 'Tunggu', style: 'cancel' },
            { text: 'Hubungkan Ulang', onPress: () => reconnectHt() },
          ]
        );
      }
      return;
    }
    const ok = await ensureMicPermission();
    if (!ok) {
      Alert.alert('Izin Mikrofon', 'Aktifkan izin mikrofon untuk berbicara via HT.');
      return;
    }

    try {
      if (chunkRecorderRef.current) {
        try {
          chunkRecorderRef.current.stop?.().catch(() => {});
          chunkRecorderRef.current.release?.();
        } catch (e) {}
        chunkRecorderRef.current = null;
      }
      if (streamRef.current) {
        try { streamRef.current.stop?.(); } catch (e) {}
        streamRef.current = null;
      }
      if (streamSubRef.current) {
        try { streamSubRef.current.remove(); } catch (e) {}
        streamSubRef.current = null;
      }
      if (streamTimerRef.current) {
        clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
      }

      sendWsMessage({ type: 'start_talk' });

      setRecording(true);
      setRecordMs(0);
      recStartRef.current = Date.now();
      talkingRef.current = true;
      setHtTalking(true);
      streamSeqRef.current = 0;
      pcmListRef.current = [];

      let useStream = false;
      if (Audio.AudioModule?.AudioStream) {
        try {
          const stream = new Audio.AudioModule.AudioStream({
            sampleRate: 16000,
            channels: 1,
            encoding: 'int16',
          });
          streamRef.current = stream;

          streamSubRef.current = stream.addListener('audioStreamBuffer', (buffer) => {
            if (buffer?.data) {
              pcmListRef.current.push(buffer.data);
            }
          });

          await stream.start();
          useStream = true;

          // Streaming chunk live setiap 800ms selagi pembicara bicara
          streamTimerRef.current = setInterval(() => {
            if (!talkingRef.current) return;
            flushStreamChunk(16000);
          }, 800);

        } catch (errStream) {
          console.warn('[HT] AudioStream start failed, fallback to AudioRecorder:', errStream?.message);
          useStream = false;
        }
      }

      if (!useStream) {
        const rec = new Audio.AudioModule.AudioRecorder(Audio.RecordingPresets.HIGH_QUALITY);
        chunkRecorderRef.current = rec;
        await rec.prepareToRecordAsync?.();
        rec.record();
      }

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        const ms = Date.now() - recStartRef.current;
        setRecordMs(ms);
        if (ms >= MAX_TALK_MS) stopRecord();
      }, 100);
    } catch (e) {
      console.warn('[HT] Gagal mulai siaran:', e?.message);
      talkingRef.current = false;
      setRecording(false);
      sendWsMessage({ type: 'stop_talk' });
      Alert.alert('Siaran Gagal', 'Tidak dapat mengaktifkan mikrofon.');
    }
  }

  async function stopRecord() {
    if (!talkingRef.current && !recording) return;
    talkingRef.current = false;
    setHtTalking(false);
    setRecording(false);

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    const durMs = Date.now() - (recStartRef.current || Date.now());

    // 1. Jika mode live AudioStream:
    if (streamRef.current) {
      const stream = streamRef.current;
      streamRef.current = null;
      if (streamSubRef.current) {
        try { streamSubRef.current.remove(); } catch (e) {}
        streamSubRef.current = null;
      }
      try {
        flushStreamChunk(stream.sampleRate || 16000);
        stream.stop?.();
      } catch (e) {}

      sendWsMessage({ type: 'stop_talk' });
      return;
    }

    // 2. Jika fallback AudioRecorder:
    const rec = chunkRecorderRef.current;
    chunkRecorderRef.current = null;
    if (!rec) {
      sendWsMessage({ type: 'stop_talk' });
      return;
    }

    try {
      await rec.stop?.().catch(() => {});
      const uri = rec.uri;
      try {
        rec.release?.();
      } catch (e) {}

      if (!uri || durMs < 500) {
        if (uri) FileSystem.deleteAsync(uri).catch(() => {});
        sendWsMessage({ type: 'stop_talk' });
        return;
      }

      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      talkSeqRef.current += 1;
      sendWsMessage({ type: 'audio', seq: talkSeqRef.current, dur: durMs, data: b64 });

      htBroadcast({
        uri,
        mimeType: 'audio/m4a',
        durationMs: durMs,
        audience: targets,
      }).catch((e) => {
        console.warn('[HT] Broadcast backup error:', e?.message);
      }).finally(() => {
        FileSystem.deleteAsync(uri).catch(() => {});
      });

      sendWsMessage({ type: 'stop_talk' });
    } catch (e) {
      console.warn('[HT] Stop record error:', e?.message);
      sendWsMessage({ type: 'stop_talk' });
    }
  }

  function stopTalkNow() {
    talkingRef.current = false;
    setHtTalking(false);
    setRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.stop?.(); } catch (e) {}
      streamRef.current = null;
    }
    if (streamSubRef.current) {
      try { streamSubRef.current.remove(); } catch (e) {}
      streamSubRef.current = null;
    }
    const rec = chunkRecorderRef.current;
    chunkRecorderRef.current = null;
    if (rec) {
      try {
        rec.stop?.().catch(() => {});
        rec.release?.();
      } catch (e) {}
    }
    sendWsMessage({ type: 'stop_talk' });
  }

  function handleTalkBusy() {
    if (talkingRef.current) {
      stopTalkNow();
      Alert.alert('Kanal Sibuk', 'Ada orang lain yang sedang bicara di kanal yang tersambung. Tunggu sebentar lalu coba lagi.');
    }
  }

  // ---------- Target picker UI ----------
  function targetCountLabel() {
    const n = (targets.sub_division_ids || []).length + (targets.employee_types || []).length + (targets.user_ids || []).length;
    return n + ' target';
  }

  function toggleSub(id) {
    setTargets((t) => {
      const list = t.sub_division_ids.includes(id)
        ? t.sub_division_ids.filter((x) => x !== id)
        : [...t.sub_division_ids, id];
      return { ...t, all: false, sub_division_ids: list };
    });
  }

  function toggleType(name) {
    setTargets((t) => {
      const list = t.employee_types.includes(name)
        ? t.employee_types.filter((x) => x !== name)
        : [...t.employee_types, name];
      return { ...t, all: false, employee_types: list };
    });
  }

  function toggleUser(id) {
    setTargets((t) => {
      const list = t.user_ids.includes(id) ? t.user_ids.filter((x) => x !== id) : [...t.user_ids, id];
      return { ...t, all: false, user_ids: list };
    });
    setUserSearch('');
    setSearchResults([]);
  }

  function searchUsers(q) {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    const query = q.trim().toLowerCase();
    setSearchResults((options?.users || []).filter((u) => (u.fullname || '').toLowerCase().includes(query)).slice(0, 8));
  }

  function applyTargets() {
    setPickerOpen(false);
    setHtTargets(targets);
  }

  function renderHeader() {
    return (
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerTitleCol}>
            {onBack ? (
              <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
                <MaterialIcons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <View style={styles.titleWrap}>
              <Text style={styles.title}>Siaran HT</Text>
            </View>
          </View>

          {/* Tombol ON AIR / OFF AIR yang rapi dan elegan */}
          <TouchableOpacity
            style={[
              styles.powerBtn,
              !enabled ? styles.powerBtnOff : styles.powerBtnOn
            ]}
            onPress={() => toggleEnabled(!enabled)}
            activeOpacity={0.8}
          >
            <View style={[
              styles.powerDot,
              !enabled ? styles.powerDotOff : styles.powerDotOn
            ]} />
            <MaterialIcons
              name={!enabled ? 'volume-off' : 'sensors'}
              size={16}
              color={!enabled ? '#ef4444' : '#10b981'}
            />
            <Text style={[
              styles.powerBtnText,
              !enabled ? styles.powerTextOff : styles.powerTextOn
            ]}>
              {!enabled ? 'OFF AIR' : 'ON AIR'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Subheader: Bar Status Koneksi & Kanal */}
        <View style={styles.statusSubRow}>
          <TouchableOpacity
            style={styles.connBadge}
            onPress={() => {
              if (conn !== 'open') {
                reconnectHt();
                Alert.alert('Menghubungkan Ulang', 'Sedang mencoba menyambung kembali ke radio HT...');
              }
            }}
            activeOpacity={conn !== 'open' ? 0.7 : 1}
          >
            <View style={[
              styles.connBadgeDot,
              conn === 'open' ? styles.connDotOpen : (conn === 'connecting' ? styles.connDotConnecting : styles.connDotOff)
            ]} />
            <Text style={[
              styles.connBadgeText,
              conn === 'open' ? styles.connTextOpen : (conn === 'connecting' ? styles.connTextConnecting : styles.connTextOff)
            ]}>
              {conn === 'open'
                ? 'Terhubung'
                : (conn === 'connecting' ? 'Menyambung… (ketuk refresh)' : 'Terputus (ketuk sambung)')}
            </Text>
            {conn !== 'open' && (
              <MaterialIcons name="refresh" size={13} color="#f59e0b" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>

          <Text style={styles.channelLabel} numberOfLines={1}>
            {enabled ? (targets.all ? 'Semua Karyawan' : targetCountLabel()) : 'Radio Nonaktif'}
          </Text>
        </View>

        <View style={styles.targetRow}>
          <TouchableOpacity
            style={[styles.targetChip, styles.targetChipMain, !enabled && { opacity: 0.5 }]}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.8}
            disabled={!enabled}
          >
            <MaterialIcons name={targets.all ? 'public' : 'filter-list'} size={16} color={colors.accent} />
            <Text style={styles.targetChipMainText} numberOfLines={1}>
              {targets.all ? 'Semua Karyawan' : targetCountLabel()}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.autoPlayBtn,
              { borderColor: autoPlay ? colors.accent + '66' : colors.border },
              !enabled && { opacity: 0.5 }
            ]}
            onPress={() => { const n = !autoPlay; setAutoPlay(n); setHtAutoPlay(n); }}
            activeOpacity={0.8}
            disabled={!enabled}
          >
            <MaterialIcons name={autoPlay ? 'play-circle-filled' : 'play-circle-outline'} size={18} color={autoPlay ? colors.accent : colors.muted} />
            <Text style={[styles.autoPlayText, { color: autoPlay ? colors.accent : colors.muted }]}>Auto Play</Text>
          </TouchableOpacity>
        </View>

        {enabled && wgLive.length > 0 && (
          <View style={styles.liveBanner}>
            <MaterialIcons name="graphic-eq" size={18} color="#fff" />
            <Text style={styles.liveText} numberOfLines={1}>
              {wgLive.map((x) => x.fullname || 'Seseorang').join(', ')} sedang bicara…
            </Text>
          </View>
        )}
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
            <Text style={styles.recText}>SIARAN LANGSUNG {Math.max(1, Math.round(recordMs / 1000))}s</Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.pttBtn,
            (recording && styles.pttBtnRec) || (disabled && styles.pttBtnIdle)
          ]}
          onPressIn={startRecord}
          onPressOut={stopRecord}
          disabled={!enabled}
          activeOpacity={0.9}
        >
          <MaterialIcons name={recording ? 'mic' : disabled ? 'mic-off' : 'mic'} size={44} color="#fff" />
          <Text style={styles.pttLabel}>
            {recording
              ? 'Lepas untuk berhenti'
              : disabled
              ? 'HT Nonaktif (OFF AIR)'
              : conn !== 'open'
              ? 'Menyambung…'
              : 'Tekan & tahan untuk bicara'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.pttHint}>
          {disabled
            ? 'Radio HT sedang dimatikan • Ketuk tombol OFF AIR di atas untuk menyalakan'
            : `Realtime • disiarkan ke ${targets.all ? 'semua' : targetCountLabel()} • maksimal 30 detik per siaran`}
        </Text>
      </View>
    );
  }

  function renderStream({ item }) {
    return (
      <TouchableOpacity
        style={styles.segCard}
        onPress={() => playAudio(item)}
        activeOpacity={0.7}
      >
        <MaterialIcons name="graphic-eq" size={16} color={colors.accent} />
        <View style={styles.segBody}>
          <Text style={styles.segName} numberOfLines={1}>
            {item.fullname || 'Seseorang'}
          </Text>
          <Text style={styles.segMeta}>{item.at} • chunk #{item.seq}</Text>
        </View>
        <MaterialIcons name="volume-up" size={16} color={colors.muted} />
      </TouchableOpacity>
    );
  }

  if (error) return <Error message={error} onRetry={() => { setError(null); loadOptions(); }} />;
  if (!loading && !featureAvailable) {

    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerTitleCol}>
              {onBack ? (
                <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
                  <MaterialIcons name="arrow-back" size={20} color={colors.text} />
                </TouchableOpacity>
              ) : null}
              <View>
                <Text style={styles.title}>Siaran HT</Text>
                <Text style={styles.subtitle}>Fitur tidak tersedia</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.empty}>
          <MaterialIcons name="portable-wifi-off" size={56} color={colors.border} />
          <Text style={[styles.emptyText, { fontSize: 15, fontWeight: '700', marginTop: 12 }]}>Fitur HT Dinonaktifkan</Text>
          <Text style={styles.emptyText}>
            Fitur Siaran HT dinonaktifkan untuk akun Anda oleh Admin/HR. Hubungi atasan jika kamu membutuhkan akses.
          </Text>
        </View>
      </View>
    );
  }

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

      {pickerOpen ? (
        <Modal transparent visible animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <View style={styles.modalRoot}>
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setPickerOpen(false)} activeOpacity={1} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleCol}>
                  <Text style={styles.modalTitle}>Audience Siaran</Text>
                  <Text style={styles.modalSub}>
                    {targets.all ? 'Seluruh karyawan' : 'Dikirim ke ' + targetCountLabel()}
                  </Text>
                </View>
                <TouchableOpacity style={styles.modalClose} onPress={() => setPickerOpen(false)} activeOpacity={0.7}>
                  <MaterialIcons name="close" size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.segRow}>
                {[
                  { k: 'semua', label: 'Semua' },
                  { k: 'subdivisi', label: 'Subdivisi', n: targets.sub_division_ids.length },
                  { k: 'jenis', label: 'Jenis', n: targets.employee_types.length },
                  { k: 'orang', label: 'Orang', n: targets.user_ids.length },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.k}
                    style={[styles.segItem, pickerTab === s.k && styles.segItemActive]}
                    onPress={() => setPickerTab(s.k)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segText, pickerTab === s.k && styles.segTextActive]}>{s.label}</Text>
                    {s.n > 0 ? (
                      <View style={styles.segCount}>
                        <Text style={styles.segCountText}>{s.n}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {pickerTab === 'semua' ? (
                  <TouchableOpacity
                    style={styles.radioRow}
                    onPress={() => setTargets({ all: true, sub_division_ids: [], employee_types: [], user_ids: [] })}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={targets.all ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={22}
                      color={targets.all ? colors.accent : colors.muted}
                    />
                    <View style={styles.radioBody}>
                      <Text style={[styles.radioTitle, targets.all && { color: colors.accent }]}>Semua Karyawan</Text>
                      <Text style={styles.radioSub}>Siaran diterima seluruh karyawan aktif</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {pickerTab === 'subdivisi' ? (
                  <View>
                    <Text style={styles.pickerLabel}>Pilih subdivisi tujuan</Text>
                    {(options?.sub_divisions || []).map((sd) => {
                      const sel = targets.sub_division_ids.includes(sd.id);
                      return (
                        <TouchableOpacity key={sd.id} style={styles.checkRow} onPress={() => toggleSub(sd.id)} activeOpacity={0.7}>
                          <MaterialIcons name={sel ? 'check-box' : 'check-box-outline-blank'} size={22} color={sel ? colors.accent : colors.muted} />
                          <Text style={[styles.checkText, sel && styles.checkTextActive]}>{sd.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {pickerTab === 'jenis' ? (
                  <View>
                    <Text style={styles.pickerLabel}>Pilih jenis karyawan</Text>
                    {(options?.employee_types || []).map((et) => {
                      const sel = targets.employee_types.includes(et);
                      return (
                        <TouchableOpacity key={et} style={styles.checkRow} onPress={() => toggleType(et)} activeOpacity={0.7}>
                          <MaterialIcons name={sel ? 'check-box' : 'check-box-outline-blank'} size={22} color={sel ? colors.accent : colors.muted} />
                          <Text style={[styles.checkText, sel && styles.checkTextActive]}>{et}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {pickerTab === 'orang' ? (
                  <View>
                    <Text style={styles.pickerLabel}>Cari karyawan</Text>
                    <View style={styles.searchRow}>
                      <MaterialIcons name="search" size={18} color={colors.muted} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Ketik nama…"
                        placeholderTextColor={colors.muted}
                        value={userSearch}
                        onChangeText={(t) => {
                          setUserSearch(t);
                          searchUsers(t);
                        }}
                      />
                    </View>
                    {targets.user_ids.length > 0 && (
                      <View style={styles.modalSelectedWrap}>
                        {targets.user_ids.map((uid) => {
                          const u = (options?.users || []).find((x) => x.id === uid);
                          return (
                            <TouchableOpacity key={uid} style={styles.modalSelectedChip} onPress={() => toggleUser(uid)} activeOpacity={0.8}>
                              <Text style={styles.modalSelectedText} numberOfLines={1}>
                                {u?.fullname || '#' + uid}
                              </Text>
                              <MaterialIcons name="close" size={14} color={colors.accent} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {searchResults.length > 0 && (
                      <View style={styles.searchResults}>
                        {searchResults.map((u) => {
                          const sel = targets.user_ids.includes(u.id);
                          return (
                            <TouchableOpacity key={u.id} style={styles.searchResultRow} onPress={() => toggleUser(u.id)} activeOpacity={0.7}>
                              <MaterialIcons name={sel ? 'check-circle' : 'add-circle-outline'} size={18} color={sel ? colors.accent : colors.muted} />
                              <Text style={[styles.searchResultName, sel && { color: colors.accent }]}>{u.fullname}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.applyBtn} onPress={applyTargets} activeOpacity={0.85}>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.applyText}>Terapkan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  powerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  powerBtnOn: {
    backgroundColor: '#10b98118',
    borderColor: '#10b981',
  },
  powerBtnOff: {
    backgroundColor: '#ef444418',
    borderColor: '#ef4444',
  },
  powerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  powerDotOn: {
    backgroundColor: '#10b981',
  },
  powerDotOff: {
    backgroundColor: '#ef4444',
  },
  powerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  powerTextOn: {
    color: '#10b981',
  },
  powerTextOff: {
    color: '#ef4444',
  },
  statusSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connDotOpen: {
    backgroundColor: '#10b981',
  },
  connDotConnecting: {
    backgroundColor: '#f59e0b',
  },
  connDotOff: {
    backgroundColor: '#ef4444',
  },
  connBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  connTextOpen: {
    color: '#10b981',
  },
  connTextConnecting: {
    color: '#f59e0b',
  },
  connTextOff: {
    color: '#ef4444',
  },
  channelLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
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
  targetChipMain: { backgroundColor: colors.accentLight + '14', borderColor: colors.accent + '44' },
  targetChipMainText: { color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: 180 },
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
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.55)' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '78%',
    paddingBottom: 18,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitleCol: { flex: 1 },
  modalTitle: { color: colors.text, fontWeight: 'bold', fontSize: 17 },
  modalSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
  },
  segItemActive: { backgroundColor: colors.card },
  segText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  segTextActive: { color: colors.accent },
  segCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  modalBody: { maxHeight: 360 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  radioBody: { flex: 1 },
  radioTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  radioSub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  checkText: { color: colors.text, fontSize: 14, flex: 1 },
  checkTextActive: { color: colors.accent, fontWeight: '700' },
  modalSelectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  modalSelectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentLight + '1e',
    borderWidth: 1,
    borderColor: colors.accent + '44',
    maxWidth: '100%',
  },
  modalSelectedText: { color: colors.accent, fontSize: 12, fontWeight: '600', maxWidth: 150 },
  modalFooter: { marginTop: 14 },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
  },
  applyText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
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