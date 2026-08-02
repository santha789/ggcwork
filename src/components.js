import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from './theme';

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.text}>Memuat data...</Text>
    </View>
  );
}

export function Error({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Text style={styles.error}>{message}</Text>
      {onRetry && (
        <Text style={styles.retry} onPress={onRetry}>
          Coba lagi
        </Text>
      )}
    </View>
  );
}

export function PasswordInput({ value, onChangeText, placeholder, style }) {
  const [show, setShow] = useState(false);
  return (
    <View style={[styles.pwdWrap, style]}>
      <TextInput
        style={styles.pwdInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.eyeBtn}
        onPress={() => setShow(!show)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons
          name={show ? 'visibility-off' : 'visibility'}
          size={20}
          color={colors.muted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  text: {
    color: colors.muted,
  },
  error: {
    color: colors.red,
    textAlign: 'center',
  },
  retry: {
    color: colors.accent,
    fontWeight: 'bold',
    padding: 8,
  },
  pwdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pwdInput: {
    flex: 1,
    padding: 14,
    color: colors.text,
  },
  eyeBtn: {
    paddingHorizontal: 12,
  },
});
