import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { getPage, postPage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';

const STATUS_META = {
  pending: { color: colors.yellow, label: 'Menunggu' },
  approved: { color: colors.green, label: 'Disetujui' },
  rejected: { color: colors.red, label: 'Ditolak' },
  canceled: { color: colors.muted, label: 'Dibatalkan' },
};

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const DOW = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISO(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayISO() {
  return toISO(new Date());
}

function fmtID(iso) {
  if (!iso) return '-';
  const parts = String(iso).split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

export default function LeaveScreen({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const props = await getPage('/leave');
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleSubmitted(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
    load();
  }

  if (error) return <Error message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const leaves = data.leaves || {};
  const list = leaves.data || [];
  const balance = data.userBalance;
  const leaveTypes = data.leaveTypes || [];

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Cuti</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <MaterialIcons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {toast ? (
        <View style={styles.toast}>
          <MaterialIcons name="check-circle" size={16} color={colors.green} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {balance ? (
        <LinearGradient
          colors={['#1d4ed8', '#4f46e5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceTitle}>Saldo Cuti Tahunan</Text>
          <Text style={styles.balanceValue}>
            {balance.remaining ?? '-'}
            <Text style={styles.balanceUnit}> hari tersisa</Text>
          </Text>
          <Text style={styles.balanceSub}>
            dari {balance.total_days ?? '-'} hari • terpakai {balance.used_days ?? 0}
          </Text>
        </LinearGradient>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Belum ada pengajuan cuti</Text>
        }
        renderItem={({ item }) => <LeaveCard item={item} />}
      />

      <LeaveFormModal
        visible={showForm}
        leaveTypes={leaveTypes}
        onClose={() => setShowForm(false)}
        onSubmitted={handleSubmitted}
      />
    </View>
  );
}

function LeaveCard({ item }) {
  const meta = STATUS_META[item.status] || {
    color: colors.muted,
    label: (item.status || 'unknown').toUpperCase(),
  };
  const name = item.user?.fullname || `${item.firstname || ''} ${item.lastname || ''}`;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{name}</Text>
        <View style={[styles.badge, { backgroundColor: meta.color + '22' }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>
            {meta.label.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.cardSub}>
        {item.leave_type?.name || item.leave_type || 'Cuti'}
        {item.total_days ? (
          <Text style={styles.cardDays}>  •  {item.total_days} Hari</Text>
        ) : null}
      </Text>
      {item.leave_number ? (
        <Text style={styles.cardNumber}>{item.leave_number}</Text>
      ) : null}
      <View style={styles.dateRow}>
        <View style={styles.dateBox}>
          <Text style={styles.dateLabel}>MULAI</Text>
          <Text style={styles.dateValue}>{item.start_date || '-'}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.dateBox}>
          <Text style={styles.dateLabel}>SELESAI</Text>
          <Text style={styles.dateValue}>{item.end_date || '-'}</Text>
        </View>
      </View>
      {item.reason ? (
        <Text style={styles.cardReason}>{item.reason}</Text>
      ) : null}
      {item.notes ? (
        <View style={styles.hrdNote}>
          <MaterialIcons name="comment" size={13} color={colors.accentLight} />
          <Text style={styles.hrdNoteText}>{item.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LeaveFormModal({ visible, leaveTypes, onClose, onSubmitted }) {
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const selectedType = leaveTypes.find((t) => String(t.id) === String(typeId));

  useEffect(() => {
    if (visible) {
      setTypeId('');
      setStart('');
      setEnd('');
      setReason('');
      setErr('');
    }
  }, [visible]);

  async function submit() {
    setErr('');
    if (!typeId) {
      setErr('Pilih tipe cuti.');
      return;
    }
    if (!start) {
      setErr('Pilih tanggal mulai.');
      return;
    }
    if (!end) {
      setErr('Pilih tanggal selesai.');
      return;
    }
    if (end < start) {
      setErr('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }
    if (!reason.trim()) {
      setErr('Isi alasan cuti.');
      return;
    }
    setSubmitting(true);
    try {
      const props = await postPage('/leave', {
        leave_type_id: typeId,
        start_date: start,
        end_date: end,
        reason: reason.trim(),
      });
      const errs = props.errors || {};
      if (errs && Object.keys(errs).length) {
        const key = Object.keys(errs)[0];
        const val = errs[key];
        setErr((Array.isArray(val) ? val[0] : val) || 'Gagal mengirim pengajuan.');
        setSubmitting(false);
        return;
      }
      onSubmitted(props.flash?.success || 'Pengajuan cuti berhasil dikirim.');
      onClose();
    } catch (e) {
      setErr(e.message || 'Gagal mengirim pengajuan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Ajukan Cuti</Text>
            <TouchableOpacity style={styles.calClose} onPress={onClose}>
              <MaterialIcons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formBody}>
            <Text style={styles.fieldLabel}>Tipe Cuti</Text>
            {leaveTypes.length ? (
              leaveTypes.map((t) => {
                const active = String(t.id) === String(typeId);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.typeOption, active && styles.typeOptionActive]}
                    onPress={() => setTypeId(String(t.id))}
                  >
                    <View style={styles.typeRow}>
                      <Text
                        style={[
                          styles.typeName,
                          active && styles.typeNameActive,
                        ]}
                      >
                        {t.name}
                      </Text>
                      <Text style={styles.typeMeta}>
                        {t.is_paid ? 'Berbayar' : 'Tidak berbayar'} • maks{' '}
                        {t.max_days_per_year ?? '-'} hari
                      </Text>
                    </View>
                    {active ? (
                      <MaterialIcons
                        name="check-circle"
                        size={18}
                        color={colors.green}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.mutedSmall}>
                Belum ada tipe cuti tersedia.
              </Text>
            )}

            {selectedType?.requires_document ? (
              <Text style={styles.docNote}>
                * Tipe cuti ini memerlukan dokumen pendukung / surat keterangan.
              </Text>
            ) : null}

            <View style={styles.dateRow}>
              <View style={styles.dateFieldWrap}>
                <Text style={styles.fieldLabel}>Mulai</Text>
                <DateField value={start} minDate={todayISO()} onChange={setStart} />
              </View>
              <View style={styles.dateFieldWrap}>
                <Text style={styles.fieldLabel}>Selesai</Text>
                <DateField value={end} minDate={start || todayISO()} onChange={setEnd} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Alasan</Text>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Tulis alasan cuti / izin..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              maxLength={1000}
            />

            {err ? <Text style={styles.formErr}>{err}</Text> : null}

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDis]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <Text style={styles.submitBtnText}>Mengirim…</Text>
              ) : (
                <>
                  <MaterialIcons name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Kirim Pengajuan</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DateField({ value, minDate, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={styles.dateInput}
        onPress={() => setOpen(true)}
      >
        <Text style={value ? styles.dateInputText : styles.dateInputPlaceholder}>
          {value ? fmtID(value) : 'Pilih tanggal'}
        </Text>
        <MaterialIcons name="calendar-month" size={18} color={colors.muted} />
      </TouchableOpacity>
      <CalendarModal
        visible={open}
        title="Pilih Tanggal"
        value={value}
        minDate={minDate}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function CalendarModal({ visible, title, value, minDate, onSelect, onClose }) {
  const init = value
    ? new Date(value)
    : minDate
      ? new Date(minDate)
      : new Date();
  const [year, setYear] = useState(init.getFullYear());
  const [month, setMonth] = useState(init.getMonth());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (visible) {
      const base = value ? new Date(value) : minDate ? new Date(minDate) : new Date();
      setYear(base.getFullYear());
      setMonth(base.getMonth());
      setReady(true);
    } else {
      setReady(false);
    }
  }, [visible]);

  if (!ready) return null;

  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toISO(new Date(year, month, d)));
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.calendarCard}>
          <View style={styles.calHeader}>
            <Text style={styles.calTitle}>{title || 'Pilih Tanggal'}</Text>
            <TouchableOpacity style={styles.calClose} onPress={onClose}>
              <MaterialIcons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <View style={styles.calNav}>
            <TouchableOpacity onPress={() => changeMonth(-1)}>
              <MaterialIcons name="chevron-left" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.calMonth}>
              {MONTHS[month]} {year}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)}>
              <MaterialIcons name="chevron-right" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.calGrid}>
            {DOW.map((d, i) => (
              <Text key={i} style={styles.calDow}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={i} style={styles.calCell} />;
              const disabled = !!minDate && iso < minDate;
              const isSel = iso === value;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.calCell,
                    isSel && styles.calCellSel,
                    disabled && styles.calCellDis,
                  ]}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(iso);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.calDay,
                      isSel && styles.calDaySel,
                      disabled && styles.calDayDis,
                    ]}
                  >
                    {Number(iso.slice(8, 10))}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.green + '55',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toastText: {
    color: colors.text,
    fontSize: 13,
    flex: 1,
  },
  balanceCard: {
    borderRadius: 18,
    padding: 18,
    gap: 2,
  },
  balanceTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  balanceValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
  },
  balanceUnit: {
    fontSize: 14,
    fontWeight: 'normal',
    color: 'rgba(255,255,255,0.9)',
  },
  balanceSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    color: colors.text,
    fontWeight: 'bold',
    flex: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  cardSub: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  cardDays: {
    color: colors.text,
    fontWeight: '700',
  },
  cardNumber: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  dateBox: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 10,
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1,
  },
  dateValue: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
    marginTop: 2,
  },
  arrow: {
    color: colors.muted,
    fontSize: 16,
  },
  cardReason: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  hrdNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
  },
  hrdNoteText: {
    color: colors.text,
    fontSize: 12,
    flex: 1,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  formBody: {
    padding: 18,
    gap: 10,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '14',
  },
  typeRow: {
    gap: 2,
    flex: 1,
  },
  typeName: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  typeNameActive: {
    color: colors.accentLight,
  },
  typeMeta: {
    color: colors.muted,
    fontSize: 11,
  },
  mutedSmall: {
    color: colors.muted,
    fontSize: 12,
  },
  docNote: {
    color: colors.yellow,
    fontSize: 11,
  },
  dateFieldWrap: {
    flex: 1,
    gap: 6,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateInputText: {
    color: colors.text,
    fontSize: 14,
  },
  dateInputPlaceholder: {
    color: colors.muted,
    fontSize: 14,
  },
  reasonInput: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  formErr: {
    color: colors.red,
    fontSize: 12,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnDis: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  calClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calMonth: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDow: {
    width: '14.28%',
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 6,
  },
  calCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calCellSel: {
    backgroundColor: colors.accent,
  },
  calCellDis: {
    opacity: 0.25,
  },
  calDay: {
    color: colors.text,
    fontSize: 13,
  },
  calDaySel: {
    color: '#fff',
    fontWeight: 'bold',
  },
  calDayDis: {
    color: colors.muted,
  },
});
