import { useCallback, useEffect, useRef, useState } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import AbsenScreen from './src/screens/AbsenScreen';
import ShiftScreen from './src/screens/ShiftScreen';
import PayrollScreen from './src/screens/PayrollScreen';
import LeaveScreen from './src/screens/LeaveScreen';
import ChatScreen from './src/screens/ChatScreen';
import CurhatScreen from './src/screens/CurhatScreen';
import PerformanceScreen from './src/screens/PerformanceScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PlaceholderScreen from './src/screens/PlaceholderScreen';
import PoinScreen from './src/screens/PoinScreen';
import PengumumanScreen from './src/screens/PengumumanScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import { logout, getPage, loadCookieJar } from './src/api';
import { colors } from './src/theme';
import { computeNotifications, unreadCounts } from './src/notifications';
import { loadLastSeen, saveLastSeen } from './src/notifStore';
import { requestNotifPermission, syncReminders } from './src/notifService';
import { getCachedPage, saveCachedPage, clearPageCache } from './src/pageCache';
import { initSilentPing, setAuthHeaders, registerFcmTokenToServer } from './src/services/silentPing';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'chat', label: 'Chat', icon: 'forum' },
  { key: 'absen', label: 'Absen', icon: 'fingerprint', main: true },
  { key: 'curhat', label: 'Curhat', icon: 'groups' },
  { key: 'profile', label: 'Profil', icon: 'person' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [subScreen, setSubScreen] = useState(null);
  const [dashData, setDashData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [lastSeen, setLastSeen] = useState(null);
  const [chatTarget, setChatTarget] = useState(null);
  const [curhatTarget, setCurhatTarget] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const pollRef = useRef(null);
  const tabRef = useRef(tab);
  const subScreenRef = useRef(subScreen);
  const chatLoadedRef = useRef(false);

  subScreenRef.current = subScreen;

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => {}
    );
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const props = await getPage('/dashboard');
      setDashData(props);
      saveCachedPage('/dashboard', props);
    } catch (e) {
      // dashboard screen punya error state sendiri
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const props = await getPage('/profile');
      setProfile(props);
      saveCachedPage('/profile', props);
    } catch (e) {
      // ignore
    }
  }, []);

  const loadSocial = useCallback(async () => {
    try {
      const props = await getPage('/social-feed');
      setPosts((props.posts && props.posts.data) || []);
      saveCachedPage('/social-feed', props);
    } catch (e) {
      // ignore
    }
  }, []);

  const loadChat = useCallback(async () => {
    try {
      const props = await getPage('/chat');
      setRooms(props.rooms || []);
      saveCachedPage('/chat', props);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [s] = await Promise.all([loadLastSeen(), loadCookieJar()]);
      setLastSeen(s);
      // Coba restore session dari persisted cookies
      try {
        const props = await getPage('/dashboard');
        if (props && props.auth?.user) {
          setUser(props.auth.user);
          setAuthHeaders({ 'X-Inertia': 'true' });
          setDashData(props);
          saveCachedPage('/dashboard', props);
          // Load data lain di background
          getPage('/profile').then((p) => { setProfile(p); saveCachedPage('/profile', p); }).catch(() => {});
          getPage('/social-feed').then((p) => { if (p?.posts?.data) setPosts(p.posts.data); saveCachedPage('/social-feed', p); }).catch(() => {});
          getPage('/chat').then((p) => { setRooms(p.rooms || []); saveCachedPage('/chat', p); }).catch(() => {});
        }
      } catch (e) {
        // Session expired, tampilkan login
      }
      setInitializing(false);
    })();
  }, []);

  // Android back button: go back or exit
  useEffect(() => {
    const onBackPress = () => {
      if (subScreenRef.current) {
        setSubScreen(null);
        return true;
      }
      if (tab !== 'dashboard') {
        setTab('dashboard');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [tab]);

  useEffect(() => {
    if (user) {
      // 1) Tampilkan data dari cache dulu supaya dashboard instan.
      getCachedPage('/dashboard').then((d) => d && setDashData(d));
      getCachedPage('/profile').then((p) => p && setProfile(p));
      getCachedPage('/social-feed').then((s) => {
        if (s && s.posts && s.posts.data) setPosts(s.posts.data);
      });
      // 2) Fetch fresh di background.
      loadDashboard();
      loadProfile();
      loadSocial();
      tabRef.current = tab;
      pollRef.current = setInterval(() => {
        loadSocial();
        if (tabRef.current === 'chat' || tabRef.current === 'curhat') loadChat();
      }, 30000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, loadDashboard, loadProfile, loadSocial, loadChat]);

  tabRef.current = tab;

  // Lazy-load chat saat tab Chat/Curhat pertama kali dibuka.
  useEffect(() => {
    if (user && (tab === 'chat' || tab === 'curhat')) {
      chatLoadedRef.current = true;
      loadChat();
    }
  }, [user, tab, loadChat]);

  useEffect(() => {
    if (user && dashData) {
      requestNotifPermission().then((granted) => {
        if (granted) {
          syncReminders({ dashboard: dashData, profile });
          initSilentPing(user.id).catch(() => {});
          registerFcmTokenToServer(user.id).catch(() => {});
        }
      });
    }
  }, [user, dashData, profile]);

  // Handle notification tap: navigate to chat
  useEffect(() => {
    if (!user) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.action === 'CHAT_MESSAGE' || data?.type === 'CHAT_MESSAGE') {
        const senderId = parseInt(data.sender_id, 10);
        if (senderId) {
          setChatTarget(senderId);
          setCurhatTarget(null);
          setSubScreen(null);
          setTab('chat');
        }
      }
      if (data?.action === 'OFFICIAL_ANNOUNCEMENT' || data?.type === 'OFFICIAL_ANNOUNCEMENT') {
        setSubScreen('pengumuman');
        setTab('dashboard');
      }
    });
    return () => sub.remove();
  }, [user]);

  // Badge sync: update OS badge count dari unread
  useEffect(() => {
    if (!user) return;
    const uc = unreadCounts({ posts, rooms, lastSeen, myId: user.id });
    const total = uc.chat + uc.curhat;
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, [user, rooms, posts, lastSeen]);

  const markAllNotifSeen = useCallback((ids) => {
    if (!ids || !ids.length) return;
    setLastSeen((prev) => {
      const seen = new Set(prev?.seen || []);
      ids.forEach((id) => seen.add(id));
      const next = { ...(prev || {}), seen: [...seen] };
      saveLastSeen(next);
      return next;
    });
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Memuat...</Text>
      </View>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={(props) => setUser(props.auth?.user || {})} />;
  }

  const hour = new Date().getHours();
  const notifList = dashData
    ? computeNotifications({
        dashboard: dashData,
        profile,
        posts,
        rooms,
        lastSeen,
        myId: user?.id,
      })
    : [];
  const seenSet = new Set(lastSeen?.seen || []);
  const notifCount = notifList.filter((n) => !seenSet.has(n.id)).length;
  const unread = unreadCounts({ posts, rooms, lastSeen, myId: user?.id });
  const tabBadge = { chat: unread.chat, curhat: unread.curhat };
  const greeting =
    hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  const initials = (user.fullname || user.name || 'G')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      // tetap lanjut keluar
    }
    clearPageCache();
    setUser(null);
    setDashData(null);
    setProfile(null);
    setPosts([]);
    setRooms([]);
    setTab('dashboard');
    chatLoadedRef.current = false;
  };

  const markCurhatRead = () => {
    if (!posts.length) return;
    const maxId = Math.max(...posts.map((p) => p.id || 0));
    setLastSeen((prev) => {
      const next = { ...(prev || {}), curhatId: maxId };
      saveLastSeen(next);
      return next;
    });
  };

  const markChatRead = (roomId, updatedAt) => {
    setLastSeen((prev) => {
      const next = {
        ...(prev || {}),
        chat: { ...(prev?.chat || {}), [roomId]: updatedAt },
      };
      saveLastSeen(next);
      return next;
    });
  };

  const openFromNotif = (n) => {
    if (n.type === 'chat') {
      setChatTarget(n.room?.id || n.partner?.id || null);
      setCurhatTarget(null);
      setSubScreen(null);
      setTab('chat');
    } else if (n.type === 'curhat') {
      setCurhatTarget(n.post?.id || null);
      setChatTarget(null);
      setSubScreen(null);
      setTab('curhat');
    } else {
      setSubScreen(null);
    }
  };

  const renderScreen = () => {
    if (subScreen === 'attendance') {
      return <AttendanceScreen user={user} onBack={() => setSubScreen(null)} />;
    }
    if (subScreen === 'shift') {
      return <ShiftScreen user={user} onBack={() => setSubScreen(null)} />;
    }
    if (subScreen === 'payroll') {
      return <PayrollScreen user={user} onBack={() => setSubScreen(null)} />;
    }
    if (subScreen === 'leave') {
      return <LeaveScreen onBack={() => setSubScreen(null)} />;
    }
    if (subScreen === 'performance') {
      return <PerformanceScreen onBack={() => setSubScreen(null)} />;
    }
    if (subScreen === 'asset') {
      return (
        <PlaceholderScreen
          title="Asset"
          icon="inventory-2"
          description="Daftar aset perusahaan yang dipinjamkan kepadamu akan tampil di sini."
          onBack={() => setSubScreen(null)}
        />
      );
    }
    if (subScreen === 'poin') {
      return (
        <PoinScreen
          onBack={() => setSubScreen(null)}
        />
      );
    }
    if (subScreen === 'tagihan') {
      return (
        <PlaceholderScreen
          title="Tagihan"
          icon="receipt"
          description="Rincian tagihan utang perusahaan yang dipotong dari gaji akan tampil di sini."
          onBack={() => setSubScreen(null)}
        />
      );
    }
    if (subScreen === 'kpi') {
      return (
        <PlaceholderScreen
          title="KPI"
          icon="track-changes"
          description="Penilaian kinerja berdasarkan pekerjaanmu akan tampil di sini."
          onBack={() => setSubScreen(null)}
        />
      );
    }
    if (subScreen === 'notifications') {
      return (
        <NotificationsScreen
          dashboard={dashData}
          profile={profile}
          posts={posts}
          rooms={rooms}
          lastSeen={lastSeen}
          myId={user?.id}
          onMarkAllSeen={markAllNotifSeen}
          onOpen={openFromNotif}
          onRefresh={() => Promise.all([loadDashboard(), loadProfile(), loadSocial(), loadChat()])}
        />
      );
    }
    if (subScreen === 'changepass') {
      return (
        <ChangePasswordScreen
          fromProfile
          onDone={() => setSubScreen(null)}
          onBack={() => setSubScreen(null)}
        />
      );
    }
    if (subScreen === 'pengumuman') {
      return <PengumumanScreen onBack={() => setSubScreen(null)} />;
    }
    switch (tab) {
      case 'absen':
        return <AbsenScreen onLoggedOut={handleLogout} />;
      case 'chat':
        return (
          <ChatScreen
            user={user}
            target={chatTarget}
            lastSeen={lastSeen}
            onTargetConsumed={() => setChatTarget(null)}
            onMarkRead={markChatRead}
          />
        );
      case 'curhat':
        return (
          <CurhatScreen
            user={user}
            target={curhatTarget}
            onTargetConsumed={() => setCurhatTarget(null)}
            onMarkRead={markCurhatRead}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            user={user}
            onChangePassword={() => setSubScreen('changepass')}
            onLogout={handleLogout}
          />
        );
      default:
        return (
          <DashboardScreen
            user={user}
            initial={dashData}
            onNavigate={setTab}
            onOpenAttendance={() => setSubScreen('attendance')}
            onOpenShift={() => setSubScreen('shift')}
            onOpenPayroll={() => setSubScreen('payroll')}
            onOpenLeave={() => setSubScreen('leave')}
            onOpenPerformance={() => setSubScreen('performance')}
            onOpenAsset={() => setSubScreen('asset')}
            onOpenPoin={() => setSubScreen('poin')}
            onOpenTagihan={() => setSubScreen('tagihan')}
            onOpenKPI={() => setSubScreen('kpi')}
            onOpenPengumuman={() => setSubScreen('pengumuman')}
          />
        );
    }
  };

  const screen = renderScreen();

  const navigateTab = (key) => {
    setSubScreen(null);
    setTab(key);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <LinearGradient
        colors={['#1e3a8a', '#312e81', '#1e1b4b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerGlow} />
        <View style={styles.headerRow}>
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={[colors.accentLight, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerGreeting}>{greeting},</Text>
            <Text style={styles.headerName} numberOfLines={1}>
              {user.fullname || user.name || 'HR'}
            </Text>
            <View style={styles.roleChip}>
              <MaterialIcons name="work-outline" size={12} color={colors.accentLight} />
              <Text style={styles.headerRole} numberOfLines={1}>
                {[
                  user?.division?.name || user?.division,
                  user?.sub_division?.name || user?.sub_division,
                  user?.position?.name || user?.position,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'KARYAWAN'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => setSubScreen('notifications')}
            activeOpacity={0.7}
          >
            <MaterialIcons name="notifications" size={20} color="#e0e7ff" />
            {notifCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {notifCount > 9 ? '9+' : notifCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.body}>{screen}</View>

      <View style={[styles.tabbar, { paddingBottom: insets.bottom + 6 }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          if (t.main) {
            return (
              <TouchableOpacity
                key={t.key}
                style={styles.tabMainWrap}
                onPress={() => navigateTab(t.key)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.tabMainBtn,
                    active && styles.tabMainBtnActive,
                  ]}
                >
                  <MaterialIcons
                    name={t.icon}
                    size={30}
                    color={active ? '#fff' : colors.accentLight}
                  />
                </View>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tab}
              onPress={() => navigateTab(t.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconWrap, active && styles.tabIconActive]}>
                <MaterialIcons
                  name={t.icon}
                  size={22}
                  color={active ? colors.accent : colors.muted}
                />
                {tabBadge[t.key] > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {tabBadge[t.key] > 9 ? '9+' : tabBadge[t.key]}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(96,165,250,0.18)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  avatarWrap: {
    shadowColor: colors.accentLight,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
  headerName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginTop: 1,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  headerRole: {
    color: colors.accentLight,
    fontSize: 11,
    letterSpacing: 0.3,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  tabMainWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: -18,
  },
  tabMainBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tabMainBtnActive: {
    backgroundColor: colors.accentLight,
  },
  tabIconWrap: {
    width: 48,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabBadge: {
    position: 'absolute',
    top: -2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  tabIconActive: {
    backgroundColor: colors.accent + '22',
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
});
