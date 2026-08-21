import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getPage, postPage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';

const fmtTime = (dt) => {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const initialsOf = (u) =>
  ((u?.firstname || u?.fullname || 'G')[0] || 'G').toUpperCase();

function Avatar({ user, online, size = 44 }) {
  return (
    <View style={{ position: 'relative' }}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
          {initialsOf(user)}
        </Text>
      </View>
      {online ? <View style={styles.onlineDot} /> : null}
    </View>
  );
}

export default function ChatScreen({ user, onBack, onMarkRead, target, onTargetConsumed, lastSeen }) {
  const [data, setData] = useState(null);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const pollRef = useRef(null);
  const targetHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      const props = await getPage('/chat');
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (target && !targetHandled.current && data) {
      targetHandled.current = true;
      const partner = (data.allUsers || []).find((u) => u.id === target);
      const room = (data.rooms || []).find((r) => r.id === target);
      if (room && room.users) {
        const other = room.users.find((u) => u.id !== user?.id);
        if (other) openChat(other.id);
        else if (onTargetConsumed) onTargetConsumed();
      } else if (partner) {
        openChat(partner.id);
      } else if (onTargetConsumed) {
        onTargetConsumed();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, data]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (roomId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const props = await getPage('/chat?room_id=' + roomId);
        setMessages(props.messages || []);
        setActiveRoom(props.activeRoom);
        setData((prev) =>
          prev
            ? {
                ...prev,
                onlineUserIds: props.onlineUserIds || prev.onlineUserIds,
              }
            : prev
        );
        const room = (props.rooms || []).find((r) => r.id === roomId);
        if (room && onMarkRead) onMarkRead(room.id, room.updated_at);
      } catch (e) {
        // abaikan, polling berikutnya dicoba lagi
      }
    }, 3000);
  };

  useEffect(() => () => stopPolling(), []);

  async function openChat(targetId) {
    setError('');
    try {
      const props = await getPage('/chat/start/' + targetId);
      if (props.activeRoom) {
        setActiveRoom(props.activeRoom);
        setMessages(props.messages || []);
        if (props.rooms) {
          const room = props.rooms.find((r) => r.id === props.activeRoom.id);
          if (room && onMarkRead) onMarkRead(room.id, room.updated_at);
        } else if (onMarkRead) {
          onMarkRead(props.activeRoom.id, new Date().toISOString());
        }
        startPolling(props.activeRoom.id);
        setTimeout(
          () => listRef.current && listRef.current.scrollToEnd({ animated: true }),
          150
        );
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || !activeRoom || sending) return;
    setSending(true);
    try {
      await postPage('/chat/room/' + activeRoom.id + '/send', { content });
      setInput('');
      const props = await getPage('/chat?room_id=' + activeRoom.id);
      setMessages(props.messages || []);
      setActiveRoom(props.activeRoom);
      setTimeout(
        () => listRef.current && listRef.current.scrollToEnd({ animated: true }),
        150
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  if (error) return <Error message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const me = user?.id;
  const onlineIds = data.onlineUserIds || [];
  const users = data.allUsers || [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => {
        const name = (u.fullname || '').toLowerCase();
        const sub = (u.sub_division?.name || u.division?.name || '').toLowerCase();
        const pos = (u.position?.name || '').toLowerCase();
        return name.includes(q) || sub.includes(q) || pos.includes(q);
      })
    : users;

  if (activeRoom) {
    const partner = (activeRoom.users || []).find((u) => u.id !== me);
    const partnerOnline = partner
      ? onlineIds.includes(partner.id) || Boolean(partner.is_online)
      : false;
    return (
      <View style={styles.container}>
        <View style={styles.topbar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              stopPolling();
              setActiveRoom(null);
              setMessages([]);
            }}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Avatar user={partner} online={partnerOnline} size={40} />
          <View style={styles.chatHead}>
            <Text style={styles.chatHeadName} numberOfLines={1}>
              {partner?.fullname || activeRoom.name || 'Chat'}
            </Text>
            <Text style={styles.chatHeadSub} numberOfLines={1}>
              {[
                partner?.sub_division?.name || partner?.division?.name,
                partner?.position?.name,
              ]
                .filter(Boolean)
                .join(' · ') || 'Divisi GGC'}
              {'  ·  '}
              {partnerOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() =>
            listRef.current && listRef.current.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <MaterialIcons
                name="chat-bubble-outline"
                size={34}
                color={colors.muted}
              />
              <Text style={styles.emptyChatText}>
                Belum ada obrolan. Ketik pesan di bawah untuk memulai.
              </Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const mine = msg.user_id === me;
            return (
              <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <View style={styles.bubbleHead}>
                    <Text style={styles.bubbleName} numberOfLines={1}>
                      {msg.user?.fullname || 'Karyawan'}
                    </Text>
                    <Text style={styles.bubbleSub}>
                      {msg.user?.sub_division?.name || ''}
                    </Text>
                  </View>
                  <Text style={[styles.bubbleContent, mine && styles.bubbleContentMine]}>
                    {msg.content}
                  </Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {fmtTime(msg.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ketik pesan..."
              placeholderTextColor={colors.muted}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
              ]}
              onPress={send}
              disabled={!input.trim() || sending}
            >
              <MaterialIcons
                name={sending ? 'hourglass-empty' : 'send'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        {onBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn}>
            <MaterialIcons name="forum" size={20} color={colors.accentLight} />
          </View>
        )}
        <View style={styles.headCenter}>
          <Text style={styles.title}>Chat & Tim GGC</Text>
          <Text style={styles.subtitle}>
            {onlineIds.length} karyawan online
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Cari nama, subdivisi, jabatan..."
          placeholderTextColor={colors.muted}
        />
      </View>

      <ScrollView contentContainerStyle={styles.contactList}>
        {(data.rooms || []).length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              Chat Terakhir
            </Text>
            {data.rooms.map((r) => {
              const partner = (r.users || [])[0] || {};
              const isOnline = onlineIds.includes(partner.id) || Boolean(partner.is_online);
              const lastMsg = r.last_message;
              const lastSeenTs = lastSeen?.chat?.[r.id];
              const hasUnread = !lastSeenTs || (lastMsg && new Date(lastMsg.created_at).getTime() > new Date(lastSeenTs).getTime());
              return (
                <TouchableOpacity
                  key={r.id}
                  style={styles.contact}
                  onPress={() => {
                    const otherId = (r.users || []).find((u) => u.id !== me)?.id;
                    if (otherId) openChat(otherId);
                  }}
                  activeOpacity={0.7}
                >
                  <Avatar user={partner} online={isOnline} />
                  <View style={styles.contactBody}>
                    <View style={styles.roomRow}>
                      <Text style={[styles.contactName, hasUnread && styles.boldText]} numberOfLines={1}>
                        {partner.fullname || r.name}
                      </Text>
                      <Text style={styles.roomTime} numberOfLines={1}>
                        {lastMsg ? fmtTime(lastMsg.created_at) : ''}
                      </Text>
                    </View>
                    <View style={styles.roomRow}>
                      <Text style={[styles.contactSub, hasUnread && styles.boldSub]} numberOfLines={1}>
                        {lastMsg
                          ? (lastMsg.sender_id === me ? 'Kamu: ' : '') + lastMsg.content
                          : (partner.sub_division?.name || partner.division?.name || 'Mulai chat')}
                      </Text>
                      {hasUnread ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>●</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        <Text style={styles.sectionLabel}>
          Direktori Karyawan ({filtered.length})
        </Text>
        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>Tidak ada kontak ditemukan.</Text>
        ) : (
          filtered.map((u) => {
            const isOnline = onlineIds.includes(u.id) || Boolean(u.is_online);
            return (
              <TouchableOpacity
                key={u.id}
                style={styles.contact}
                onPress={() => openChat(u.id)}
                activeOpacity={0.7}
              >
                <Avatar user={u} online={isOnline} />
                <View style={styles.contactBody}>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {u.fullname}
                  </Text>
                  <Text style={styles.contactSub} numberOfLines={1}>
                    {[
                      u.sub_division?.name || u.division?.name || 'Staf',
                      u.position?.name,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                </View>
                {isOnline ? (
                  <View style={styles.onlinePill}>
                    <Text style={styles.onlinePillText}>Online</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headCenter: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 10,
    fontSize: 13,
  },
  contactList: {
    padding: 14,
    paddingBottom: 24,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  contactBody: {
    flex: 1,
  },
  contactName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  contactSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  onlinePill: {
    backgroundColor: colors.green + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  onlinePillText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '700',
  },
  avatar: {
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentLight,
    fontWeight: 'bold',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  chatHead: {
    flex: 1,
  },
  chatHeadName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  chatHeadSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  msgList: {
    padding: 14,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyChatText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    paddingBottom: 3,
  },
  bubbleName: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: 'bold',
    flex: 1,
  },
  bubbleSub: {
    color: colors.muted,
    fontSize: 9,
  },
  bubbleContent: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  bubbleContentMine: {
    color: '#fff',
  },
  bubbleTime: {
    color: colors.muted,
    fontSize: 9,
    textAlign: 'right',
  },
  bubbleTimeMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 13,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  roomTime: {
    color: colors.muted,
    fontSize: 11,
    flexShrink: 0,
  },
  boldText: {
    fontWeight: '700',
    color: colors.text,
  },
  boldSub: {
    fontWeight: '600',
    color: colors.text,
  },
  unreadBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    flexShrink: 0,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 6,
    textAlign: 'center',
    lineHeight: 10,
  },
});
