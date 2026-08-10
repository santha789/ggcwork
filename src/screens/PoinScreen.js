import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { pokerStatus } from '../pokerApi';

export default function PoinScreen({ onBack }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setStatus(await pokerStatus());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Poin</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Coba lagi</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <MaterialIcons name="stars" size={30} color="#f0b429" />
              <Text style={styles.heroLabel}>Total Poin</Text>
              <Text style={styles.heroValue}>{status?.points_total ?? 0}</Text>
              <Text style={styles.heroSub}>Poin tidak pernah kadaluarsa</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0c1020' },
  center: { paddingVertical: 60, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 12 },
  headerSpacer: { flex: 1 },
  body: { padding: 16, paddingBottom: 40 },
  errorBox: { alignItems: 'center', paddingVertical: 40 },
  errorText: { color: '#ff8a9c', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  hero: {
    backgroundColor: '#141a33',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#232b4d',
  },
  heroLabel: { color: '#8b93b8', fontSize: 13, fontWeight: '600', marginTop: 6 },
  heroValue: { color: '#f0b429', fontSize: 42, fontWeight: '800', marginTop: 2 },
  heroSub: { color: '#8b93b8', fontSize: 12, marginTop: 4 },
  card: {
    marginTop: 14,
    backgroundColor: '#141a33',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#232b4d',
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 10 },
});