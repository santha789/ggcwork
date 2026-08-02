import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, APP_VERSION } from '../theme';

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <MaterialIcons name={icon} size={18} color={colors.accentLight} />
      </View>
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '-'}</Text>
      </View>
    </View>
  );
}

function ActionRow({ icon, label, hint, danger, onPress }) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIcon, danger && styles.actionIconDanger]}>
        <MaterialIcons
          name={icon}
          size={18}
          color={danger ? colors.red : colors.accentLight}
        />
      </View>
      <View style={styles.infoBody}>
        <Text style={[styles.actionLabel, danger && { color: colors.red }]}>
          {label}
        </Text>
        {hint ? <Text style={styles.infoLabel}>{hint}</Text> : null}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ user, onChangePassword, onLogout }) {
  const initials = (user.fullname || 'G')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  function confirmLogout() {
    Alert.alert(
      'Keluar',
      'Yakin ingin keluar dari aplikasi?',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Keluar', style: 'destructive', onPress: onLogout },
      ],
      { cancelable: true }
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user.fullname}</Text>
        <Text style={styles.position}>
          {user.position?.name || user.position || 'Karyawan'}
        </Text>
        <Text style={styles.dept}>
          {[user.division?.name, user.sub_division?.name]
            .filter(Boolean)
            .join(' · ') || '-'}
        </Text>
      </View>

      <View style={styles.card}>
        <InfoRow icon="badge" label="NIP / Employee ID" value={user.employee_id} />
        <InfoRow icon="email" label="Email" value={user.email} />
        <InfoRow icon="wc" label="Jenis Kelamin" value={user.gender} />
        <InfoRow
          icon="work"
          label="Tipe Karyawan"
          value={user.employee_type}
        />
        <InfoRow
          icon="apartment"
          label="Divisi"
          value={user.division?.name}
        />
        <InfoRow
          icon="grid-view"
          label="Sub Divisi"
          value={user.sub_division?.name}
        />
      </View>

      <View style={styles.card}>
        <ActionRow
          icon="lock"
          label="Ganti Kata Sandi"
          hint="Perbarui password akun kamu"
          onPress={onChangePassword}
        />
      </View>

      <View style={styles.notice}>
        <View style={styles.noticeIcon}>
          <MaterialIcons name="info-outline" size={20} color={colors.yellow} />
        </View>
        <View style={styles.infoBody}>
          <Text style={styles.noticeTitle}>Data kurang sesuai?</Text>
          <Text style={styles.noticeText}>
            Jika data profil di atas tidak sesuai (nama, divisi, jabatan, dan
            lainnya), silakan laporkan ke tim HR untuk diperbarui.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={confirmLogout}
        activeOpacity={0.8}
      >
        <MaterialIcons name="logout" size={18} color={colors.red} />
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>

      <Text style={styles.version}>GGC Work v{APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    gap: 4,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: {
    color: colors.accentLight,
    fontWeight: 'bold',
    fontSize: 28,
  },
  name: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 20,
    textAlign: 'center',
  },
  position: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '600',
  },
  dept: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.accent + '1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBody: {
    flex: 1,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  infoValue: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    marginTop: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.accent + '1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconDanger: {
    backgroundColor: colors.red + '1a',
  },
  actionLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  notice: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.yellow + '14',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.yellow + '33',
    padding: 14,
    alignItems: 'flex-start',
  },
  noticeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.yellow + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: {
    color: colors.yellow,
    fontWeight: 'bold',
    fontSize: 14,
  },
  noticeText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.red + '14',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.red + '33',
    paddingVertical: 14,
  },
  logoutText: {
    color: colors.red,
    fontWeight: 'bold',
    fontSize: 15,
  },
  version: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    letterSpacing: 0.3,
  },
});
