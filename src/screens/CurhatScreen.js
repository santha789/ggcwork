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
import { getPage, postPage, deletePage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';

function relTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
  if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function roleBadge(roles) {
  const name = Array.isArray(roles) && roles.length > 0 ? roles[0].name : '';
  if (['admin', 'it', 'owner'].includes(name)) return 'Admin';
  if (['executive', 'direktur_utama', 'direktur_operasional'].includes(name))
    return 'Direksi';
  if (name === 'hr') return 'HR';
  if (['magang', 'pkl'].includes(name)) return 'PKL / Magang';
  return 'Staff';
}

const roleColor = (roles) => {
  const name = Array.isArray(roles) && roles.length > 0 ? roles[0].name : '';
  if (['admin', 'it', 'owner'].includes(name)) return colors.purple;
  if (['executive', 'direktur_utama', 'direktur_operasional'].includes(name))
    return colors.yellow;
  if (name === 'hr') return colors.accentLight;
  return colors.green;
};

const avatarInitial = (u) =>
  ((u?.firstname || u?.fullname || 'G')[0] || 'G').toUpperCase();

function Avatar({ user, size = 40 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
        {avatarInitial(user)}
      </Text>
    </View>
  );
}

function PostCard({ post, me, meRole, onLike, onComment, onDelete, highlight }) {
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const liked = (post.likes || []).some((l) => l.user_id === me);
  const canDelete =
    me === post.user_id ||
    ['admin', 'hr', 'it', 'owner', 'executive'].includes(meRole);

  async function submitComment() {
    const content = comment.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await onComment(post.id, content);
      setComment('');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Hapus Status',
      'Apakah Anda yakin ingin menghapus postingan ini? Semua komentar dan suka akan ikut terhapus.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => onDelete(post.id) },
      ]
    );
  }

  return (
    <View style={[styles.postCard, highlight && styles.postCardHighlight]}>
      <View style={styles.postHead}>
        <Avatar user={post.user} />
        <View style={styles.postHeadBody}>
          <View style={styles.postNameRow}>
            <Text style={styles.postName} numberOfLines={1}>
              {post.user?.fullname || 'Karyawan'}
            </Text>
            <View
              style={[
                styles.roleBadge,
                { borderColor: roleColor(post.user?.roles) + '44' },
              ]}
            >
              <Text style={[styles.roleBadgeText, { color: roleColor(post.user?.roles) }]}>
                {roleBadge(post.user?.roles)}
              </Text>
            </View>
          </View>
          <Text style={styles.postMeta}>
            {post.user?.sub_division?.name || post.user?.division?.name || 'GGC Staff'}
            {'  •  '}
            {relTime(post.created_at)}
          </Text>
        </View>
        {post.is_pinned ? (
          <View style={styles.pinnedBadge}>
            <Text style={styles.pinnedText}>PINNED</Text>
          </View>
        ) : null}
        {canDelete ? (
          <TouchableOpacity onPress={confirmDelete} style={styles.deleteBtn}>
            <MaterialIcons name="delete-outline" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {post.type === 'announcement' ? (
        <View style={styles.announceBadge}>
          <MaterialIcons name="campaign" size={14} color={colors.yellow} />
          <Text style={styles.announceText}>PENGUMUMAN RESMI</Text>
        </View>
      ) : null}

      <Text style={styles.postContent}>{post.content}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statsLeft}>
          <MaterialIcons name="thumb-up" size={14} color={colors.accentLight} />
          <Text style={styles.statsText}>
            <Text style={{ color: colors.text, fontWeight: 'bold' }}>
              {post.likes_count || 0}
            </Text>{' '}
            menyukai
          </Text>
        </View>
        <Text style={styles.statsText}>
          <Text style={{ color: colors.text, fontWeight: 'bold' }}>
            {post.comments_count || 0}
          </Text>{' '}
          komentar
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, liked && styles.actionBtnLiked]}
          onPress={() => onLike(post.id)}
        >
          <MaterialIcons
            name={liked ? 'favorite' : 'favorite-border'}
            size={17}
            color={liked ? colors.red : colors.muted}
          />
          <Text style={[styles.actionText, liked && { color: colors.red }]}>Suka</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, showComments && styles.actionBtnActive]}
          onPress={() => setShowComments((v) => !v)}
        >
          <MaterialIcons
            name="comment"
            size={17}
            color={showComments ? colors.accentLight : colors.muted}
          />
          <Text
            style={[styles.actionText, showComments && { color: colors.accentLight }]}
          >
            Komentar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() =>
            Alert.alert(
              'Bagikan',
              'Link postingan: ' + 'https://hrmggc.ggclinkgroup.com/social-feed'
            )
          }
        >
          <MaterialIcons name="share" size={17} color={colors.muted} />
          <Text style={styles.actionText}>Bagikan</Text>
        </TouchableOpacity>
      </View>

      {showComments ? (
        <View style={styles.commentsBox}>
          {post.comments && post.comments.length > 0 ? (
            post.comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <Avatar user={c.user} size={30} />
                <View style={styles.commentBubble}>
                  <View style={styles.commentHead}>
                    <Text style={styles.commentName} numberOfLines={1}>
                      {c.user?.fullname || 'Karyawan'}
                    </Text>
                    <Text style={styles.commentTime}>{relTime(c.created_at)}</Text>
                    {me === c.user_id ? (
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert(
                            'Hapus Komentar',
                            'Yakin ingin menghapus komentar ini?',
                            [
                              { text: 'Batal', style: 'cancel' },
                              {
                                text: 'Hapus',
                                style: 'destructive',
                                onPress: () =>
                                  onDelete(c.id, { comment: true, postId: post.id }),
                              },
                            ]
                          )
                        }
                      >
                        <MaterialIcons name="close" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.commentText}>{c.content}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.noComments}>
              Belum ada komentar. Jadilah yang pertama memberikan komentar!
            </Text>
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Tulis komentar..."
              placeholderTextColor={colors.muted}
              returnKeyType="send"
              onSubmitEditing={submitComment}
            />
            <TouchableOpacity
              style={[styles.commentSend, (!comment.trim() || busy) && styles.disabled]}
              onPress={submitComment}
              disabled={!comment.trim() || busy}
            >
              <MaterialIcons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function CurhatScreen({ user, onBack, onMarkRead, target, onTargetConsumed }) {
  const [data, setData] = useState(null);
  const [composer, setComposer] = useState('');
  const [postType, setPostType] = useState('text');
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const listRef = useRef(null);
  const targetHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      const props = await getPage('/social-feed');
      setData(props);
      setError('');
      if (onMarkRead) {
        const latest = props.posts?.data?.reduce((mx, p) => Math.max(mx, p.id || 0), 0);
        if (latest > 0) onMarkRead();
      }
    } catch (e) {
      setError(e.message);
    }
  }, [onMarkRead]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (target && !targetHandled.current && data) {
      targetHandled.current = true;
      const posts = (data.posts && data.posts.data) || [];
      const idx = posts.findIndex((p) => p.id === target);
      if (idx >= 0) {
        setHighlightId(target);
        setTimeout(() => {
          listRef.current &&
            listRef.current.scrollToIndex({ index: idx, viewPosition: 0.2, animated: true });
        }, 200);
        setTimeout(() => setHighlightId(null), 2500);
      }
      if (onTargetConsumed) onTargetConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, data]);

  async function run(fn) {
    setError('');
    try {
      await fn();
      const props = await getPage('/social-feed');
      setData(props);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitPost() {
    const content = composer.trim();
    if (!content || posting) return;
    setPosting(true);
    await run(async () => {
      await postPage('/social-feed/post', { content, type: postType, is_pinned: false });
    });
    setComposer('');
    setPosting(false);
  }

  const likePost = (id) =>
    run(async () => {
      setBusyId(id);
      await postPage('/social-feed/post/' + id + '/like', {});
    }).finally(() => setBusyId(null));

  const commentPost = (id, content) =>
    run(async () => {
      setBusyId('c' + id);
      await postPage('/social-feed/post/' + id + '/comment', { content });
    }).finally(() => setBusyId(null));

  const deletePost = (id) =>
    run(async () => {
      await deletePage('/social-feed/post/' + id);
    });

  const deleteComment = (id) =>
    run(async () => {
      await deletePage('/social-feed/comment/' + id);
    });

  if (error) return <Error message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const posts = (data.posts && data.posts.data) || [];
  const me = user?.id;
  const myRole =
    user?.role ||
    (Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles[0].name : '');

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        {onBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn}>
            <MaterialIcons name="groups" size={20} color={colors.accentLight} />
          </View>
        )}
        <View style={styles.headCenter}>
          <Text style={styles.title}>Curhat</Text>
          <Text style={styles.subtitle}>Lini masa karyawan GGC</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.feed}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current &&
              listRef.current.scrollToIndex({
                index: Math.min(info.index, posts.length - 1),
                viewPosition: 0.2,
                animated: true,
              });
          }, 400);
        }}
        ListHeaderComponent={
          <View style={styles.composer}>
            <View style={styles.composerHead}>
              <Avatar user={user} size={42} />
              <View style={styles.composerHeadBody}>
                <Text style={styles.composerName}>{user.fullname}</Text>
                <Text style={styles.composerHint}>
                  Bagikan ide, kabar, atau pengumuman dengan rekan kerja
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.composerInput}
              value={composer}
              onChangeText={setComposer}
              placeholder="Apa yang ingin Anda bagikan hari ini?"
              placeholderTextColor={colors.muted}
              multiline
            />
            <View style={styles.composerFooter}>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[
                    styles.typePill,
                    postType === 'text' && styles.typePillActive,
                  ]}
                  onPress={() => setPostType('text')}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      postType === 'text' && styles.typePillTextActive,
                    ]}
                  >
                    💬 Diskusi
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typePill,
                    postType === 'announcement' && styles.typePillAnnounceActive,
                  ]}
                  onPress={() => setPostType('announcement')}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      postType === 'announcement' && styles.typePillAnnounceText,
                    ]}
                  >
                    📢 Pengumuman
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.publishBtn,
                  (!composer.trim() || posting) && styles.disabled,
                ]}
                onPress={submitPost}
                disabled={!composer.trim() || posting}
              >
                <MaterialIcons
                  name={posting ? 'hourglass-empty' : 'send'}
                  size={16}
                  color="#fff"
                />
                <Text style={styles.publishText}>
                  {posting ? 'Memposting...' : 'Publikasikan'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyFeed}>
            <MaterialIcons name="groups" size={44} color={colors.muted} />
            <Text style={styles.emptyFeedText}>
              Belum ada postingan. Mulai diskusi pertama dengan membagikan kabar!
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            me={me}
            meRole={myRole}
            highlight={highlightId === item.id}
            onLike={likePost}
            onComment={commentPost}
            onDelete={deletePost}
          />
        )}
      />
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
  feed: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  composer: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 4,
  },
  composerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  composerHeadBody: {
    flex: 1,
  },
  composerName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  composerHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  composerInput: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 12,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  typePillActive: {
    borderColor: colors.accentLight + '66',
    backgroundColor: colors.accent + '22',
  },
  typePillAnnounceActive: {
    borderColor: colors.yellow + '66',
    backgroundColor: colors.yellow + '18',
  },
  typePillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  typePillTextActive: {
    color: colors.accentLight,
  },
  typePillAnnounceText: {
    color: colors.yellow,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  publishText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  emptyFeed: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 50,
  },
  emptyFeedText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: 240,
  },
  postCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  postCardHighlight: {
    borderColor: colors.purple,
    borderWidth: 2,
    backgroundColor: colors.purple + '11',
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  postHeadBody: {
    flex: 1,
  },
  postNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
    flexShrink: 1,
  },
  roleBadge: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  postMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  pinnedBadge: {
    backgroundColor: colors.yellow + '18',
    borderWidth: 1,
    borderColor: colors.yellow + '44',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pinnedText: {
    color: colors.yellow,
    fontSize: 9,
    fontWeight: 'bold',
  },
  deleteBtn: {
    padding: 4,
  },
  announceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.yellow + '14',
    borderWidth: 1,
    borderColor: colors.yellow + '33',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  announceText: {
    color: colors.yellow,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  postContent: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsText: {
    color: colors.muted,
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnLiked: {
    backgroundColor: colors.red + '14',
  },
  actionBtnActive: {
    backgroundColor: colors.accent + '14',
  },
  actionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  commentsBox: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 9,
    gap: 2,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 12,
    flex: 1,
  },
  commentTime: {
    color: colors.muted,
    fontSize: 10,
  },
  commentText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  noComments: {
    color: colors.muted,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  commentInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  commentSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
});
