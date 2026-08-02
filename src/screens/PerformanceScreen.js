import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getPage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';

function WinnerRow({ winner, onPress }) {
  return (
    <TouchableOpacity style={styles.winnerRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.winnerLeft}>
        <View style={styles.rankPill}>
          <Text style={styles.rankPillText}>{winner.rank_label}</Text>
        </View>
        <View style={styles.winnerBody}>
          <Text style={styles.winnerName} numberOfLines={1}>
            {winner.user.fullname}
          </Text>
          <Text style={styles.winnerSub} numberOfLines={1}>
            {winner.user.sub_division !== '-'
              ? winner.user.sub_division
              : winner.user.division}
            {' • '}
            <Text style={{ color: colors.text }}>{winner.user.position}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.winnerRight}>
        <View style={styles.compliancePill}>
          <Text style={styles.complianceText}>
            {winner.compliance_rate}% · {winner.hadir_on_time}/
            {winner.scheduled_work_days} Hari
          </Text>
        </View>
        <Text
          style={[
            styles.winnerNote,
            winner.hadir_on_time === winner.scheduled_work_days
              ? { color: colors.green }
              : { color: colors.yellow },
          ]}
        >
          {winner.hadir_on_time === winner.scheduled_work_days
            ? '100% Hadir Tepat & Clock-Out Lengkap'
            : `${winner.scheduled_work_days - winner.hadir_on_time} Hari Belum Clock-Out (${winner.tap_dates_str})`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function AttentionRow({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.attnRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.attnLeft}>
        <View style={styles.attnRank}>
          <Text style={styles.attnRankText}>#{item.rank_num}</Text>
        </View>
        <View style={styles.winnerBody}>
          <Text style={styles.winnerName} numberOfLines={1}>
            {item.user.fullname}
          </Text>
          <Text style={styles.winnerSub} numberOfLines={1}>
            {item.user.sub_division !== '-'
              ? item.user.sub_division
              : item.user.division}
            {' • '}
            <Text style={{ color: colors.text }}>{item.user.position}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.winnerRight}>
        <View style={styles.attnPill}>
          <Text style={styles.attnPillText}>
            {item.telat} Telat ({item.late_minutes}m) · {item.tap} TAP ·{' '}
            {item.alpha} Alpha
          </Text>
        </View>
        <Text style={styles.attnNote}>
          {item.tap > 0
            ? `Belum Clock-Out Tgl: ${item.tap_dates_str}`
            : `Kepatuhan: ${item.compliance_rate}% (Skor: ${item.score})`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PerformanceScreen({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const props = await getPage('/dashboard');
      setData(props.performanceData || null);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Error message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const best = data.top3Best || [];
  const worst = data.top3Worst || [];

  const DetailModal = () => {
    const item = selected;
    if (!item) return null;
    const showDanger =
      item.telat > 0 || item.tap > 0 || item.tam > 0 || item.alpha > 0;
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {item.user.fullname}
              </Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <MaterialIcons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              {[
                item.user.division,
                item.user.sub_division,
                item.user.position,
              ]
                .filter((v) => v && v !== '-')
                .join(' · ') || 'Karyawan'}
            </Text>

            <View style={styles.modalStats}>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatValue}>
                  {item.compliance_rate}%
                </Text>
                <Text style={styles.modalStatLabel}>Kepatuhan</Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatValue}>
                  {item.hadir_on_time}/{item.scheduled_work_days}
                </Text>
                <Text style={styles.modalStatLabel}>Hadir Lengkap</Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatValue}>{item.score}</Text>
                <Text style={styles.modalStatLabel}>Skor</Text>
              </View>
            </View>

            <View style={styles.modalList}>
              <View style={[styles.modalRow, { borderColor: colors.green + '44' }]}>
                <Text style={styles.modalRowLabel}>Telat</Text>
                <Text style={[styles.modalRowValue, { color: colors.yellow }]}>
                  {item.telat} ({item.late_minutes}m)
                </Text>
              </View>
              <View style={[styles.modalRow, { borderColor: colors.accentLight + '44' }]}>
                <Text style={styles.modalRowLabel}>TAM (Tidak Absen Masuk)</Text>
                <Text style={[styles.modalRowValue, { color: colors.accentLight }]}>
                  {item.tam}
                </Text>
              </View>
              <View style={[styles.modalRow, { borderColor: colors.pink + '44' }]}>
                <Text style={styles.modalRowLabel}>TAP (Tidak Absen Pulang)</Text>
                <Text style={[styles.modalRowValue, { color: colors.pink }]}>
                  {item.tap}
                </Text>
              </View>
              <View style={[styles.modalRow, { borderColor: colors.red + '44' }]}>
                <Text style={styles.modalRowLabel}>Alpha</Text>
                <Text style={[styles.modalRowValue, { color: colors.red }]}>
                  {item.alpha}
                </Text>
              </View>
              <View style={[styles.modalRow, { borderColor: colors.purple + '44' }]}>
                <Text style={styles.modalRowLabel}>Sakit / Izin</Text>
                <Text style={[styles.modalRowValue, { color: colors.purple }]}>
                  {item.sakit} / {item.izin}
                </Text>
              </View>
            </View>

            {showDanger && item.telat_dates_str !== '-' ? (
              <Text style={styles.modalDanger}>
                Tanggal telat: {item.telat_dates_str}
              </Text>
            ) : null}
            {item.tap > 0 ? (
              <Text style={styles.modalDanger}>
                Belum clock-out: {item.tap_dates_str}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headCenter}>
          <Text style={styles.title}>Performa</Text>
          <Text style={styles.subtitle}>Karyawan Teladan Bulan Ini</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={[1]}
        keyExtractor={() => 'x'}
        contentContainerStyle={styles.body}
        ListHeaderComponent={
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <MaterialIcons name="emoji-events" size={30} color={colors.yellow} />
              </View>
              <Text style={styles.heroTitle}>Karyawan Teladan Bulan Ini</Text>
              <Text style={styles.heroMonth}>{data.month_name}</Text>
              <Text style={styles.heroDesc}>
                Penilaian otomatis disiplin presensi karyawan aktif (0 Telat, 0
                Sakit, 0 Alpha)
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: colors.green }]}>
                  Top 3 Pemenang Karyawan Teladan
                </Text>
                <Text style={styles.sectionHint}>100% Disiplin Waktu</Text>
              </View>
              {best.length === 0 ? (
                <Text style={styles.emptyText}>
                  Belum ada data kalkulasi presensi bulan ini.
                </Text>
              ) : (
                best.map((w) => (
                  <WinnerRow key={w.user.id} winner={w} onPress={() => setSelected(w)} />
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: colors.red }]}>
                  Top 3 Perhatian Khusus Absensi
                </Text>
                <Text style={styles.sectionHint}>Evaluasi Presensi</Text>
              </View>
              {worst.length === 0 ? (
                <Text style={styles.emptyText}>
                  Tidak ada pelanggaran absensi bulan ini.
                </Text>
              ) : (
                worst.map((w) => (
                  <AttentionRow key={w.user.id} item={w} onPress={() => setSelected(w)} />
                ))
              )}
            </View>
          </>
        }
        renderItem={() => null}
      />

      <DetailModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  headCenter: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    padding: 14,
    gap: 14,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.yellow + '44',
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.yellow + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  heroMonth: {
    color: colors.yellow,
    fontSize: 13,
    fontWeight: '700',
  },
  heroDesc: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  winnerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankPill: {
    backgroundColor: colors.yellow + '22',
    borderWidth: 1,
    borderColor: colors.yellow + '66',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  rankPillText: {
    color: colors.yellow,
    fontSize: 10,
    fontWeight: 'bold',
  },
  winnerBody: {
    flex: 1,
  },
  winnerName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  winnerSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  winnerRight: {
    alignItems: 'flex-end',
    gap: 3,
    maxWidth: '45%',
  },
  compliancePill: {
    backgroundColor: colors.green + '1a',
    borderWidth: 1,
    borderColor: colors.green + '44',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  complianceText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '700',
  },
  winnerNote: {
    fontSize: 9,
    textAlign: 'right',
  },
  attnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  attnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  attnRank: {
    backgroundColor: colors.red + '1a',
    borderWidth: 1,
    borderColor: colors.red + '55',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  attnRankText: {
    color: colors.red,
    fontSize: 10,
    fontWeight: 'bold',
  },
  attnPill: {
    backgroundColor: colors.red + '1a',
    borderWidth: 1,
    borderColor: colors.red + '44',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  attnPillText: {
    color: colors.red,
    fontSize: 10,
    fontWeight: '700',
  },
  attnNote: {
    color: colors.muted,
    fontSize: 9,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: 'bold',
    flex: 1,
  },
  modalSub: {
    color: colors.muted,
    fontSize: 12,
  },
  modalStats: {
    flexDirection: 'row',
    gap: 8,
  },
  modalStat: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  modalStatValue: {
    color: colors.accentLight,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalStatLabel: {
    color: colors.muted,
    fontSize: 9,
  },
  modalList: {
    gap: 6,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalRowLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  modalRowValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalDanger: {
    color: colors.yellow,
    fontSize: 11,
    lineHeight: 16,
  },
});
