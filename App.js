import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
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
import { logout, getPage } from './src/api';
import { colors, APP_VERSION } from './src/theme';
import { computeNotifications } from './src/notifications';
import { loadLastSeen, saveLastSeen } from './src/notifStore';
import { requestNotifPermission, syncReminders } from './src/notifService';

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
  const pollRef = useRef(null);

  const loadDashboard = useCallback(async () => {
    try {
      const props = await getPage('/dashboard');
      setDashData(props);
    } catch (e) {
      // dashboard screen punya error state sendiri
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const props = await getPage('/profile');
      setProfile(props);
    } catch (e) {
      // ignore
    }
  }, []);

  const loadSocial = useCallback(async () => {
    try {
      const props = await getPage('/social-feed');
      setPosts((props.posts && props.posts.data) || []);
    } catch (e) {
      // ignore
    }
  }, []);

  const loadChat = useCallback(async () => {
    try {
      const props = await getPage('/chat');
      setRooms(props.rooms || []);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadLastSeen().then(setLastSeen);
  }, []);

  useEffect(() => {
    if (user) {
      loadDashboard();
      loadProfile();
      loadSocial();
      loadChat();
      pollRef.current = setInterval(() => {
        loadSocial();
        loadChat();
      }, 30000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, loadDashboard, loadProfile, loadSocial, loadChat]);

  useEffect(() => {
    if (user && dashData) {
      requestNotifPermission().then((granted) => {
        if (granted) syncReminders({ dashboard: dashData, profile });
      });
    }
  }, [user, dashData, profile]);

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
  const greeting =
    hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  const todayLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
    setUser(null);
    setDashData(null);
    setProfile(null);
    setPosts([]);
    setRooms([]);
    setTab('dashboard');
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
    switch (tab) {
      case 'absen':
        return <AbsenScreen />;
      case 'chat':
        return (
          <ChatScreen
            user={user}
            target={chatTarget}
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
          <View style={styles.logoWrap}>
            <Image
              source={require('./assets/ggclink-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.versionBadge}>
              <Text style={styles.versionText}>v{APP_VERSION}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
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
            <View style={styles.headerDateChip}>
              <MaterialIcons name="calendar-today" size={12} color={colors.accentLight} />
              <Text style={styles.headerDateText} numberOfLines={1}>
                {todayLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRow2}>
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
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 84,
    height: 26,
  },
  headerDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    maxWidth: 170,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  headerDateText: {
    color: '#e0e7ff',
    fontSize: 10,
    fontWeight: '600',
  },
  headerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  versionBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  versionText: {
    color: colors.accentLight,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
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
