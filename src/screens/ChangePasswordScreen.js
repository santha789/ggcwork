import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { changePassword } from '../api';
import { colors } from '../theme';
import { PasswordInput } from '../components';

export default function ChangePasswordScreen({ onDone, onBack, fromProfile }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit() {
    if (!current || !password) {
      setError('Isi password saat ini dan password baru.');
      return;
    }
    if (password.length < 8) {
      setError('Password baru minimal 8 karakter.');
      return;
    }
    if (password !== confirm) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const props = await changePassword(current, password);
      setSuccess('Kata sandi berhasil diperbarui.');
      setCurrent('');
      setPassword('');
      setConfirm('');
      if (fromProfile && onBack) {
        setTimeout(onBack, 1200);
      } else {
        onDone(props);
      }
    } catch (e) {
      setError(e.message || 'Ganti password gagal.');
    } finally {
      setLoading(false);
    }
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
          {fromProfile && onBack ? (
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title}>
            {fromProfile ? 'Ganti Kata Sandi' : 'Ubah Kata Sandi'}
          </Text>
          <Text style={styles.subtitle}>
            {fromProfile
              ? 'Perbarui kata sandi akun kamu. Pastikan kata sandi baru mudah diingat dan aman.'
              : 'Sebelum masuk, kamu perlu mengganti kata sandi bawaan dengan kata sandi baru.'}
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Kata Sandi Saat Ini</Text>
            <PasswordInput
              value={current}
              onChangeText={setCurrent}
              placeholder="••••••••"
            />
            <Text style={styles.label}>Kata Sandi Baru</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="Minimal 8 karakter"
            />
            <Text style={styles.label}>Konfirmasi Kata Sandi Baru</Text>
            <PasswordInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Ulangi kata sandi baru"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.success}>{success}</Text> : null}

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
                  {loading
                    ? 'Menyimpan...'
                    : fromProfile
                    ? 'Simpan Perubahan'
                    : 'Simpan & Masuk'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
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
  backBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.accentLight,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    fontSize: 13,
    lineHeight: 19,
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
  success: {
    color: colors.green,
    marginTop: 8,
    fontSize: 12,
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
});
