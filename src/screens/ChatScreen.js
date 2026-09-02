import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getChatRooms,
  getChatMessages,
  sendChatMessage,
  markChatRead,
  startPrivateChat,
  getChatUsers,
} from '../chatApi';
import { Loading, Error } from '../components';
import { colors } from '../theme';

const fmtTime = (dt) => {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const fmtDateSeparator = (dt) => {
  if (!dt) return '';
  const d = new Date(dt);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hari Ini';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const initialsOf = (name) => {
  if (!name) return 'G';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0][0] || 'G').toUpperCase();
};

function Avatar({ name, online, size = 44, bgColor = colors.cardAlt }) {
  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
          },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
          {initialsOf(name)}
        </Text>
      </View>
      {online ? <View style={styles.onlineDot} /> : null}
    </View>
  );
}

export default function ChatScreen({
  user,
  onBack,
  onMarkRead,
  target,
  onTargetConsumed,
  onActiveRoomChange,
}) {
  const insets = useSafeAreaInsets();
  const [rooms, setRooms] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'contacts'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Active Chat Room State
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const listRef = useRef(null);
  const pollRef = useRef(null);
  const roomPollRef = useRef(null);
  const latestMsgIdRef = useRef(0);
  const targetHandled = useRef(false);

  // Keyboard listener for Android & iOS
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Sync active room state with parent App.js (to hide main chrome)
  useEffect(() => {
    if (onActiveRoomChange) {
      onActiveRoomChange(!!activeRoom);
    }
  }, [activeRoom, onActiveRoomChange]);

  // Handle Android hardware back button inside room
  useEffect(() => {
    if (activeRoom) {
      const onBackPress = () => {
        exitRoom();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }
  }, [activeRoom]);

  // Load Rooms List
  const loadRooms = useCallback(async (showIndicator = false) => {
    if (showIndicator) setLoading(true);
    try {
      const res = await getChatRooms();
      if (res.success && Array.isArray(res.data)) {
        setRooms(res.data);
        setError('');
      }
    } catch (e) {
      if (!rooms.length) setError(e.message || 'Gagal memuat pesan.');
    } finally {
      if (showIndicator) setLoading(false);
    }
  }, [rooms.length]);

  // Load Contacts Directory
  const loadContacts = useCallback(async () => {
    try {
      const res = await getChatUsers();
      if (res.success && Array.isArray(res.data)) {
        setContacts(res.data);
      }
    } catch (e) {}
  }, []);

  // Initial fetch
  useEffect(() => {
    loadRooms(true);
    loadContacts();
  }, []);

  // Periodic rooms poller when in room list
  useEffect(() => {
    if (!activeRoom) {
      roomPollRef.current = setInterval(() => {
        loadRooms(false);
      }, 5000);
      return () => {
        if (roomPollRef.current) clearInterval(roomPollRef.current);
      };
    }
  }, [activeRoom, loadRooms]);

  // Handle external deep link target (e.g. from notifications)
  useEffect(() => {
    if (target && !targetHandled.current) {
      targetHandled.current = true;
      if (typeof target === 'number') {
        openChatWithUser(target);
      }
      if (onTargetConsumed) onTargetConsumed();
    }
  }, [target, onTargetConsumed]);

  // Stop messages poller
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Exit active room
  const exitRoom = () => {
    stopPolling();
    setActiveRoom(null);
    if (onActiveRoomChange) onActiveRoomChange(false);
    loadRooms(false);
  };

  // Delta polling for active room (queries only new messages after latestMsgId)
  const startPolling = (roomId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const afterId = latestMsgIdRef.current;
        const res = await getChatMessages(roomId, afterId);
        if (res.success && res.data) {
          const newMsgs = res.data.messages || [];
          if (newMsgs.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const filteredNew = newMsgs.filter((m) => !existingIds.has(m.id));
              if (filteredNew.length === 0) return prev;
              const combined = [...prev, ...filteredNew];
              latestMsgIdRef.current = Math.max(...combined.map((m) => (typeof m.id === 'number' ? m.id : 0)));
              return combined;
            });
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
          }
          if (res.data.room) {
            setActiveRoom((prev) => ({
              ...prev,
              ...res.data.room,
            }));
          }
        }
      } catch (e) {
        // network retry on next interval
      }
    }, 2000);
  };

  useEffect(() => () => stopPolling(), []);

  // Open conversation room
  async function openRoom(room) {
    setActiveRoom(room);
    if (onActiveRoomChange) onActiveRoomChange(true);
    setMessages([]);
    setLoadingMessages(true);
    stopPolling();

    try {
      const res = await getChatMessages(room.id);
      if (res.success && res.data) {
        const list = res.data.messages || [];
        setMessages(list);
        latestMsgIdRef.current = res.data.latest_id || (list.length ? list[list.length - 1].id : 0);
        if (res.data.room) {
          setActiveRoom(res.data.room);
        }
        startPolling(room.id);
        markChatRead(room.id).catch(() => {});
        if (onMarkRead) onMarkRead(room.id, new Date().toISOString());
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } catch (e) {
      setError(e.message || 'Gagal memuat pesan chat.');
    } finally {
      setLoadingMessages(false);
    }
  }

  // Start chat with user ID directly
  async function openChatWithUser(targetUserId) {
    setLoadingMessages(true);
    try {
      const startRes = await startPrivateChat(targetUserId);
      if (startRes.success && startRes.room_id) {
        const roomObj = { id: startRes.room_id, type: 'private' };
        await openRoom(roomObj);
      }
    } catch (e) {
      setError(e.message || 'Gagal memulai percakapan.');
      setLoadingMessages(false);
    }
  }

  // Send message with instant optimistic UI update
  async function handleSend() {
    const content = input.trim();
    if (!content || sending || !activeRoom) return;

    setInput('');
    const tempId = 'temp_' + Date.now();
    const optimisticMsg = {
      id: tempId,
      chat_room_id: activeRoom.id,
      user_id: user?.id,
      sender_name: user?.fullname || 'Saya',
      sender_first: user?.firstname || 'Saya',
      content,
      type: 'text',
      is_mine: true,
      is_read: false,
      created_at: new Date().toISOString(),
      is_pending: true,
    };

    // Instant append for zero latency
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    setSending(true);
    try {
      const res = await sendChatMessage(activeRoom.id, content);
      if (res.success && res.data) {
        const realMsg = res.data;
        latestMsgIdRef.current = Math.max(latestMsgIdRef.current, realMsg.id);
        // Replace temp optimistic message with confirmed server message
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...realMsg, is_mine: true } : m))
        );
      }
    } catch (e) {
      // Mark failed message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, is_failed: true, is_pending: false } : m))
      );
    } finally {
      setSending(false);
    }
  }

  // Refresh room list
  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadRooms(false), loadContacts()]);
    setRefreshing(false);
  }

  // Filtered rooms list
  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return rooms;
    const q = searchQuery.toLowerCase();
    return rooms.filter((r) => {
      const name = (r.name || '').toLowerCase();
      const subDiv = (r.partner?.sub_division || '').toLowerCase();
      const last = (r.last_message?.content || '').toLowerCase();
      return name.includes(q) || subDiv.includes(q) || last.includes(q);
    });
  }, [rooms, searchQuery]);

  // Filtered contacts list
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter((c) => {
      const name = (c.fullname || '').toLowerCase();
      const empId = (c.employee_id || '').toLowerCase();
      const subDiv = (c.sub_division || '').toLowerCase();
      return name.includes(q) || empId.includes(q) || subDiv.includes(q);
    });
  }, [contacts, searchQuery]);

  if (loading && !rooms.length && !activeRoom) {
    return <Loading />;
  }

  // ==========================================
  // VIEW: INSIDE ACTIVE CHAT ROOM
  // ==========================================
  if (activeRoom) {
    const partnerName = activeRoom.partner?.fullname || activeRoom.name || 'Chat';
    const partnerSubDiv = activeRoom.partner?.sub_division || 'GGCLink Staff';
    const isPartnerOnline = !!activeRoom.partner?.is_online;

    return (
      <View style={styles.roomContainer}>
        {/* Chat Room Topbar */}
        <View style={[styles.roomTopbar, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={exitRoom}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Avatar name={partnerName} online={isPartnerOnline} size={40} bgColor={colors.accent + '33'} />

          <View style={styles.roomHeaderCenter}>
            <Text style={styles.roomPartnerName} numberOfLines={1}>
              {partnerName}
            </Text>
            <View style={styles.statusRow}>
              {isPartnerOnline ? (
                <Text style={styles.onlineStatusText}>🟢 Online</Text>
              ) : (
                <Text style={styles.offlineStatusText}>{partnerSubDiv}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Messages List */}
        {loadingMessages ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyChatBox}>
            <MaterialIcons name="forum" size={48} color={colors.muted + '66'} />
            <Text style={styles.emptyChatTitle}>Mulai Percakapan</Text>
            <Text style={styles.emptyChatDesc}>
              Kirim pesan pertama kamu kepada {partnerName}.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, idx) => String(item.id || idx)}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item, index }) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const showDateSep = !prev || new Date(item.created_at).toDateString() !== new Date(prev.created_at).toDateString();
              const isMine = !!item.is_mine;

              return (
                <View key={item.id}>
                  {showDateSep ? (
                    <View style={styles.dateSeparator}>
                      <Text style={styles.dateSeparatorText}>
                        {fmtDateSeparator(item.created_at)}
                      </Text>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.messageRow,
                      isMine ? styles.messageRowMine : styles.messageRowOther,
                    ]}
                  >
                    {!isMine ? (
                      <View style={{ marginRight: 6, alignSelf: 'flex-end', marginBottom: 2 }}>
                        <Avatar name={item.sender_name} size={28} bgColor={colors.cardAlt} />
                      </View>
                    ) : null}

                    <View
                      style={[
                        styles.bubble,
                        isMine ? styles.bubbleMine : styles.bubbleOther,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          isMine ? styles.messageTextMine : styles.messageTextOther,
                        ]}
                      >
                        {item.content}
                      </Text>

                      <View style={styles.metaRow}>
                        <Text
                          style={[
                            styles.timeText,
                            isMine ? styles.timeTextMine : styles.timeTextOther,
                          ]}
                        >
                          {fmtTime(item.created_at)}
                        </Text>
                        {isMine ? (
                          <Text style={styles.statusTick}>
                            {item.is_pending ? '⌛' : (item.is_read ? '✓✓' : '✓')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Chat Input Bar with dynamic keyboard spacing */}
        <View
          style={[
            styles.inputContainer,
            {
              paddingBottom: keyboardHeight > 0
                ? 10
                : Math.max(insets.bottom, 12),
              marginBottom: Platform.OS === 'ios' && keyboardHeight > 0 ? keyboardHeight : 0,
            },
          ]}
        >
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ketik pesan..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={3000}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !input.trim() && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==========================================
  // VIEW: ROOMS LIST & CONTACTS DIRECTORY
  // ==========================================
  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Pesan & Diskusi</Text>
        <Text style={styles.headerSubtitle}>GGCLink Internal Messenger</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari pesan atau nama rekan kerja..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialIcons name="close" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tab Switcher: Percakapan vs Kontak Karyawan */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'rooms' && styles.tabBtnActive]}
          onPress={() => setActiveTab('rooms')}
        >
          <MaterialIcons
            name="chat"
            size={16}
            color={activeTab === 'rooms' ? colors.accentLight : colors.muted}
          />
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'rooms' && styles.tabBtnTextActive,
            ]}
          >
            Obrolan ({rooms.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'contacts' && styles.tabBtnActive]}
          onPress={() => setActiveTab('contacts')}
        >
          <MaterialIcons
            name="people"
            size={16}
            color={activeTab === 'contacts' ? colors.accentLight : colors.muted}
          />
          <Text
            style={[
              styles.tabBtnText,
              activeTab === 'contacts' && styles.tabBtnTextActive,
            ]}
          >
            Karyawan ({contacts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {error ? <Error message={error} onRetry={() => loadRooms(true)} /> : null}

      {/* Rooms List */}
      {activeTab === 'rooms' ? (
        filteredRooms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="chat-bubble-outline" size={54} color={colors.muted} />
            <Text style={styles.emptyTitle}>Belum Ada Obrolan</Text>
            <Text style={styles.emptySubtitle}>
              Pilih tab "Karyawan" untuk memulai obrolan baru dengan rekan kerja.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRooms}
            keyExtractor={(item) => String(item.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            contentContainerStyle={styles.roomsList}
            renderItem={({ item }) => {
              const partner = item.partner;
              const name = partner?.fullname || item.name || 'Chat';
              const lastMsg = item.last_message;
              const isOnline = !!partner?.is_online;
              const unread = item.unread_count || 0;

              return (
                <TouchableOpacity
                  style={[styles.roomCard, unread > 0 && styles.roomCardUnread]}
                  onPress={() => openRoom(item)}
                  activeOpacity={0.7}
                >
                  <Avatar name={name} online={isOnline} size={48} bgColor={colors.cardAlt} />

                  <View style={styles.roomCardCenter}>
                    <View style={styles.roomCardTopRow}>
                      <Text style={[styles.roomCardName, unread > 0 && styles.roomCardNameBold]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.roomCardTime}>
                        {lastMsg ? lastMsg.time_ago || fmtTime(lastMsg.created_at) : ''}
                      </Text>
                    </View>

                    <Text style={styles.roomCardSubDiv} numberOfLines={1}>
                      {partner?.sub_division || 'Staff'}
                    </Text>

                    <View style={styles.roomCardBottomRow}>
                      <Text
                        style={[
                          styles.roomCardLastMsg,
                          unread > 0 && styles.roomCardLastMsgUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {lastMsg ? (lastMsg.is_mine ? 'Anda: ' : '') + lastMsg.content : 'Belum ada pesan.'}
                      </Text>

                      {unread > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {unread > 99 ? '99+' : unread}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )
      ) : (
        /* Contacts Directory Tab */
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={styles.roomsList}
          renderItem={({ item }) => {
            return (
              <TouchableOpacity
                style={styles.contactCard}
                onPress={() => openChatWithUser(item.id)}
                activeOpacity={0.7}
              >
                <Avatar name={item.fullname} online={item.is_online} size={46} bgColor={colors.cardAlt} />

                <View style={styles.contactCenter}>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {item.fullname}
                  </Text>
                  <Text style={styles.contactSubDiv} numberOfLines={1}>
                    {item.sub_division} • {item.position}
                  </Text>
                </View>

                <View style={styles.chatActionBtn}>
                  <MaterialIcons name="send" size={16} color={colors.accentLight} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  roomContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    padding: 0,
  },
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.accent + '22',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  tabBtnTextActive: {
    color: colors.accentLight,
    fontWeight: 'bold',
  },
  roomsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  roomCardUnread: {
    borderColor: colors.accent + '66',
    backgroundColor: colors.accent + '10',
  },
  roomCardCenter: {
    flex: 1,
  },
  roomCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  roomCardNameBold: {
    fontWeight: 'bold',
    color: '#fff',
  },
  roomCardTime: {
    fontSize: 10,
    color: colors.muted,
  },
  roomCardSubDiv: {
    fontSize: 11,
    color: colors.accentLight,
    marginTop: 1,
  },
  roomCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  roomCardLastMsg: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
    marginRight: 8,
  },
  roomCardLastMsgUnread: {
    color: colors.text,
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  contactCenter: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  contactSubDiv: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  chatActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '44',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    fontWeight: 'bold',
    color: colors.text,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // =========================
  // ROOM STYLES
  // =========================
  roomTopbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  backBtn: {
    padding: 4,
    marginRight: 2,
  },
  roomHeaderCenter: {
    flex: 1,
  },
  roomPartnerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  onlineStatusText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '600',
  },
  offlineStatusText: {
    fontSize: 11,
    color: colors.muted,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChatBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  emptyChatDesc: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  dateSeparator: {
    alignSelf: 'center',
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateSeparatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 7,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: '#4338ca',
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  messageTextMine: {
    color: '#ffffff',
  },
  messageTextOther: {
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  timeText: {
    fontSize: 9.5,
  },
  timeTextMine: {
    color: '#c7d2fe',
  },
  timeTextOther: {
    color: colors.muted,
  },
  statusTick: {
    fontSize: 10,
    color: '#a5b4fc',
    fontWeight: 'bold',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    color: colors.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.muted + '44',
  },
});
