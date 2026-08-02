import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
});
