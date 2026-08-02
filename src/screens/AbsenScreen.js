import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme';

function clockText() {
  const d = new Date();
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function dateText() {
  const d = new Date();
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function AbsenScreen() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.date}>{dateText()}</Text>

      <View style={styles.clockBlock}>
        <Text style={styles.clock}>{clockText()}</Text>
      </View>

      <View style={styles.comingSoon}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="construction" size={44} color={colors.accentLight} />
        </View>
        <Text style={styles.title}>Absen Smartphone Segera Hadir</Text>
        <Text style={styles.desc}>
          Fitur absen masuk & pulang langsung dari aplikasi ini sedang
          dipersiapkan oleh tim. Nantikan pembaruan berikutnya ya.
        </Text>
        <View style={styles.badge}>
          <MaterialIcons name="schedule" size={14} color={colors.yellow} />
          <Text style={styles.badgeText}>Segera Hadir</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
  date: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  clockBlock: {
    alignItems: 'center',
  },
  clock: {
    color: colors.text,
    fontSize: 64,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  comingSoon: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    paddingTop: 12,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  desc: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.yellow + '22',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.yellow,
    fontSize: 12,
    fontWeight: '700',
  },
});
