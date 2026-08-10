import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { login } from '../api';
import { apiLogin, storeLoginEmail } from '../attendanceApi';
import { colors, APP_VERSION } from '../theme';
import { PasswordInput } from '../components';
import ChangePasswordScreen from './ChangePasswordScreen';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [needChange, setNeedChange] = useState(false);

  async function submit() {
    if (!email || !password) {
      setError('Isi email dan password.');
      return;
    }
    setLoading(true);
    setError('');
    setHint('');
    try {
      // 1. Login web (cookie) untuk fitur lama: dashboard, chat, curhat, dll.
      const props = await login(email.trim(), password);
      // 2. Login API (Sanctum token) untuk absen. Gagal di sini TIDAK
      //    memblokir masuk, karena absen bisa disambungkan lagi di halaman
      //    absen. Kalau gagal, tampilkan hint agar tidak bingung.
      await storeLoginEmail(email.trim());
      try {
        await apiLogin(email.trim(), password);
      } catch (apiErr) {
        console.log('apiLogin failed:', apiErr && apiErr.message);
        setHint(
          'Kamu berhasil masuk, tapi layanan absen belum tersambung (' +
            ((apiErr && apiErr.message) || 'gagal') +
            '). Buka tab Absen untuk menyambungkannya.'
        );
      }
      onLogin(props);
    } catch (e) {
      console.log('LOGIN_DEBUG error=', e);
      console.log('LOGIN_DEBUG msg=', e && e.message, 'type=', typeof e);
      console.log('LOGIN_DEBUG stack=', e && e.stack);
      if (e.needsPasswordChange) {
        setNeedChange(true);
      } else {
        setError(e.message || 'Login gagal.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (needChange) {
    return <ChangePasswordScreen onDone={onLogin} />;
  }

  return (
    <LinearGradient
      colors={['#1e3a8a', '#1e1b4b', '#0b1120']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.safe}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/ggclink-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>GGC Work</Text>
          <Text style={styles.subtitle}>APLIKASI KARYAWAN</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="nama@email.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <Text style={styles.label}>Password</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={submit}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.accentLight, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGrad}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Masuk...' : 'Masuk'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>GGCLINK Group © 2026 · v{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 220,
    height: 86,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.accentLight,
    textAlign: 'center',
    marginBottom: 28,
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: colors.red,
    marginTop: 8,
    fontSize: 12,
  },
  hint: {
    color: colors.yellow,
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    borderRadius: 12,
    marginTop: 16,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGrad: {
    padding: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  footer: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 28,
    fontSize: 12,
  },
});
