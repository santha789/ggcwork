import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function PlaceholderScreen({ title, description, icon, onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.comingSoon}>
        <View style={styles.iconWrap}>
          <MaterialIcons name={icon || 'construction'} size={44} color={colors.accentLight} />
        </View>
        <Text style={styles.heading}>{title} Segera Hadir</Text>
        <Text style={styles.desc}>
          {description ||
            'Fitur ini sedang dipersiapkan oleh tim GGC. Nantikan pembaruan berikutnya ya.'}
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
    padding: 16,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginBottom: 12,
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
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    paddingBottom: 80,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
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
