import * as Audio from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { htWsUrl } from "../htApi";
import { getStoredToken } from "../attendanceApi";

let ws = null;
let reconnectTimer = null;
let keepAliveTimer = null;
let activeUser = null;
let myUserId = null;
let isEnabled = true;
let currentAudience = { all: true, sub_division_ids: [], employee_types: [], user_ids: [] };
let autoPlay = true;

// Player state
let currentPlayer = null;
let currentPlaySub = null;
const playQueue = [];
let isPlaying = false;
let playSeq = 0;
let talking = false;

// Subscribers for UI updates (e.g. HtScreen)
const subscribers = new Set();
let talkersLive = [];
let incomingItems = []; // latest items (newest first)

function notifySubscribers() {
  const state = {
    conn: ws && ws.readyState === WebSocket.OPEN ? "open" : ws && ws.readyState === WebSocket.CONNECTING ? "connecting" : "off",
    talkers: [...talkersLive],
    incoming: [...incomingItems],
    enabled: isEnabled,
    autoPlay,
  };
  subscribers.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {}
  });
}

export function subscribeHt(callback) {
  subscribers.add(callback);
  notifySubscribers();
  return () => subscribers.delete(callback);
}

export function getHtState() {
  return {
    conn: ws && ws.readyState === WebSocket.OPEN ? "open" : ws && ws.readyState === WebSocket.CONNECTING ? "connecting" : "off",
    talkers: [...talkersLive],
    incoming: [...incomingItems],
    enabled: isEnabled,
    autoPlay,
  };
}

export function setHtEnabled(next) {
  isEnabled = !!next;
  pushConfig();
  notifySubscribers();
}

export function setHtAutoPlay(next) {
  autoPlay = !!next;
  notifySubscribers();
}

export function setHtTargets(targets) {
  currentAudience = targets || { all: true };
  pushConfig();
}

export function setHtTalking(state) {
  talking = !!state;
}

export function sendWsMessage(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

function pushConfig() {
  if (!sendWsMessage({ type: "config", enabled: isEnabled, audience: currentAudience })) return;
  setTimeout(() => sendWsMessage({ type: "join" }), 60);
}

export async function initHtService(user) {
  activeUser = user;
  if (!user) {
    disconnectHt();
    return;
  }

  Audio.setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
    allowsRecording: true,
  }).catch(() => {});

  connectHt();
}

export function disconnectHt() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  reconnectTimer = null;
  keepAliveTimer = null;

  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }

  talkersLive = [];
  notifySubscribers();
}

export async function connectHt() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  let token = null;
  try {
    token = await getStoredToken();
  } catch (e) {}

  if (!token) {
    notifySubscribers();
    return;
  }

  try {
    ws = new WebSocket(htWsUrl());
  } catch (e) {
    scheduleReconnect();
    return;
  }

  notifySubscribers();

  ws.onopen = () => {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
      sendWsMessage({ type: "ping" });
    }, 15000);

    sendWsMessage({ type: "auth", token });
    setTimeout(() => {
      sendWsMessage({ type: "config", enabled: isEnabled, audience: currentAudience });
    }, 60);
    setTimeout(() => {
      sendWsMessage({ type: "join" });
    }, 120);

    notifySubscribers();
  };

  ws.onmessage = (ev) => {
    let m = null;
    try {
      m = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    handleMessage(m);
  };

  ws.onerror = () => {};

  ws.onclose = () => {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    ws = null;
    talkersLive = [];
    notifySubscribers();
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer || !activeUser) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectHt();
  }, 3000);
}

function handleMessage(m) {
  switch (m.type) {
    case "ready":
      pushConfig();
      break;
    case "ack":
      sendWsMessage({ type: "join" });
      break;
    case "joined":
      if (m.self?.user_id) {
        myUserId = m.self.user_id;
      }
      if (m.talkers) {
        talkersLive = m.talkers;
        notifySubscribers();
      }
      break;
    case "talk":
      updateTalker(m);
      break;
    case "talk_busy":
      break;
    case "audio":
      // Echo prevention: jangan putar jika kita yang bicara atau dari userId sendiri
      if (talking) return;
      if (myUserId && String(m.user_id) === String(myUserId)) return;
      if (activeUser?.id && String(m.user_id) === String(activeUser.id)) return;
      enqueueAudio(m);
      break;
    default:
      break;
  }
}

function updateTalker(m) {
  const live = [...talkersLive];
  const idx = live.findIndex((x) => x.user_id === m.user_id);
  if (m.state) {
    if (idx < 0) live.push({ user_id: m.user_id, fullname: m.fullname });
  } else {
    if (idx >= 0) live.splice(idx, 1);
  }
  talkersLive = live;
  notifySubscribers();
}

function nowLabel() {
  return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function enqueueAudio(m) {
  if (talking) return;
  if (myUserId && String(m.user_id) === String(myUserId)) return;
  if (activeUser?.id && String(m.user_id) === String(activeUser.id)) return;

  const now = Date.now();
  const ext = m.data && m.data.startsWith("UklGR") ? "wav" : "m4a";
  const key = ++playSeq;
  const tmpUri = FileSystem.cacheDirectory + "ht_" + key + "_" + now + "." + ext;

  // Pre-write chunk in background to eliminate disk write latency at playback start
  if (m.data) {
    FileSystem.writeAsStringAsync(tmpUri, m.data, { encoding: FileSystem.EncodingType.Base64 }).catch(() => {});
  }

  // Karena newest on top, elemen paling baru adalah index 0
  const isContinuation =
    incomingItems.length > 0 &&
    incomingItems[0].user_id === m.user_id &&
    now - (incomingItems[0].ts || 0) < 4000;

  let item;
  if (isContinuation) {
    const prev = incomingItems[0];
    item = {
      ...prev,
      dur: (prev.dur || 0) + (m.dur || 800),
      seq: m.seq,
      data: m.data,
      tmpUri,
      ts: now,
    };
    // Update elemen teratas
    incomingItems = [item, ...incomingItems.slice(1)];
  } else {
    item = {
      key,
      user_id: m.user_id,
      fullname: m.fullname,
      data: m.data,
      dur: m.dur || 800,
      at: nowLabel(),
      seq: m.seq,
      tmpUri,
      ts: now,
    };
    // Masukkan ke paling depan (newest on top) maksimal 50 riwayat
    incomingItems = [item, ...incomingItems].slice(0, 50);
  }

  notifySubscribers();

  if (autoPlay) {
    playAudio(item);
  }
}

export function playAudio(item) {
  if (!item || !item.data) return;
  playQueue.push(item);
  processQueue();
}

async function processQueue() {
  if (isPlaying) return;
  if (playQueue.length === 0) return;

  const item = playQueue.shift();
  if (!item || !item.data) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const ext = item.data.startsWith("UklGR") ? "wav" : "m4a";
  const tmp = item.tmpUri || (FileSystem.cacheDirectory + "ht_" + item.key + "." + ext);

  try {
    // Pastikan file tertulis
    await FileSystem.writeAsStringAsync(tmp, item.data, { encoding: FileSystem.EncodingType.Base64 });

    if (currentPlaySub) {
      try {
        currentPlaySub.remove();
      } catch (e) {}
      currentPlaySub = null;
    }
    if (currentPlayer) {
      try {
        currentPlayer.pause();
        currentPlayer.remove();
      } catch (e) {}
      currentPlayer = null;
    }

    Audio.setIsAudioActiveAsync(true).catch(() => {});

    const player = Audio.createAudioPlayer(tmp, {
      updateInterval: 100,
      keepAudioSessionActive: true,
    });
    currentPlayer = player;
    try {
      player.volume = 1.0;
    } catch (e) {}

    let finished = false;
    const cleanUp = () => {
      if (finished) return;
      finished = true;
      if (currentPlaySub) {
        try {
          currentPlaySub.remove();
        } catch (e) {}
        currentPlaySub = null;
      }
      if (currentPlayer === player) {
        try {
          player.pause();
          player.remove();
        } catch (e) {}
        currentPlayer = null;
      }
      FileSystem.deleteAsync(tmp).catch(() => {});
      isPlaying = false;
      // Langsung proses antrian berikutnya tanpa delay
      processQueue();
    };

    currentPlaySub = player.addListener("playbackStatusUpdate", (status) => {
      if (status?.didJustFinish || status?.playbackState === "ended") {
        cleanUp();
      }
    });

    player.play();

    // Timeout pengaman jika status playback terlambat/tidak terpanggil di native
    const timeoutMs = Math.max(800, (item.dur || 800) + 400);
    setTimeout(() => {
      if (!finished) cleanUp();
    }, timeoutMs);
  } catch (e) {
    console.warn("[HT Manager] Play error:", e?.message);
    FileSystem.deleteAsync(tmp).catch(() => {});
    isPlaying = false;
    processQueue();
  }
}
