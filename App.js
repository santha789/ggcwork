import { useCallback, useEffect, useState } from 'react';
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
import EmployeesScreen from './src/screens/EmployeesScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import LeaveScreen from './src/screens/LeaveScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import { logout, getPage } from './src/api';
import { colors, APP_VERSION } from './src/theme';
import { computeNotifications } from './src/notifications';
import { requestNotifPermission, syncReminders } from './src/notifService';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'employees', label: 'Karyawan', icon: 'people' },
  { key: 'attendance', label: 'Absensi', icon: 'event-available' },
  { key: 'leave', label: 'Cuti', icon: 'flight-takeoff' },
  { key: 'notifications', label: 'Notifikasi', icon: 'notifications' },
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
  const [dashData, setDashData] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const props = await getPage('/dashboard');
      setDashData(props);
    } catch (e) {
      // dashboard screen punya error state sendiri
    }
  }, []);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user, loadDashboard]);

  useEffect(() => {
    if (user && dashData) {
      requestNotifPermission().then((granted) => {
        if (granted) syncReminders(dashData);
      });
    }
  }, [user, dashData]);

  if (!user) {
    return <LoginScreen onLogin={(props) => setUser(props.auth?.user || {})} />;
  }

  const notifCount = dashData ? computeNotifications(dashData).length : 0;

  const renderScreen = () => {
    switch (tab) {
      case 'employees':
        return <EmployeesScreen />;
      case 'attendance':
        return <AttendanceScreen />;
      case 'leave':
        return <LeaveScreen />;
      case 'notifications':
        return <NotificationsScreen initial={dashData} onRefresh={loadDashboard} />;
      default:
        return <DashboardScreen initial={dashData} onRefresh={loadDashboard} onNavigate={setTab} />;
    }
  };

  const screen = renderScreen();

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <LinearGradient
        colors={['#1e3a8a', '#1e1b4b', '#0b1120']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerLeft}>
          <Image
            source={require('./assets/ggclink-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerText}>
            <Text style={styles.headerName}>
              {user.fullname || user.name || 'HR'}
            </Text>
            <Text style={styles.headerRole}>KARYAWAN</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v{APP_VERSION}</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={async () => {
              await logout();
              setUser(null);
              setDashData(null);
            }}
          >
            <Text style={styles.logoutText}>Keluar</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.body}>{screen}</View>

      <View style={[styles.tabbar, { paddingBottom: insets.bottom + 6 }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tab}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconWrap, active && styles.tabIconActive]}>
                <MaterialIcons
                  name={t.icon}
                  size={22}
                  color={active ? colors.accent : colors.muted}
                />
                {t.key === 'notifications' && notifCount > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {notifCount > 9 ? '9+' : notifCount}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logo: {
    width: 90,
    height: 36,
  },
  headerText: {
    flex: 1,
  },
  headerName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  headerRole: {
    color: colors.accentLight,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  versionText: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  logoutText: {
    color: colors.pink,
    fontSize: 13,
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
  tabBadge: {
    position: 'absolute',
    top: -4,
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
