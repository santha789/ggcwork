import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { getPage } from '../api';
import {
  getShiftExchangeMyRequests,
  getShiftExchangeRosterInfo,
  submitShiftExchangeRequest,
  cancelShiftExchangeRequest,
} from '../attendanceApi';
import { MaterialIcons } from '@expo/vector-icons';
import { Loading, Error } from '../components';
import { colors } from '../theme';
import { shiftName, shiftShort } from '../shifts';

function monthName(m) {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return names[(m || 1) - 1] || m;
}

export function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ShiftScreen({ user, onBack }) {
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'exchange'
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  // Shift Exchange States
  const [myExchanges, setMyExchanges] = useState([]);
  const [loadingExchanges, setLoadingExchanges] = useState(false);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [rosterInfo, setRosterInfo] = useState(null);
  const [loadingRosterInfo, setLoadingRosterInfo] = useState(false);
  
  // Form states
  const [exchangeMode, setExchangeMode] = useState('peer'); // 'peer' | 'direct'
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr = getLocalDateStr(new Date());

  const upcomingDays = useMemo(() => {
    const list = [];
    const daysIndo = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const base = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const dateStr = getLocalDateStr(d);
      list.push({
        dateStr,
        dayName: i === 0 ? 'Hari Ini' : (i === 1 ? 'Besok' : daysIndo[d.getDay()]),
        dateNum: `${d.getDate()}/${d.getMonth() + 1}`,
        isToday: i === 0,
      });
    }
    return list;
  }, []);

  const loadCalendar = useCallback(async (m, y) => {
    try {
      const props = await getPage(`/attendance/summary?month=${m}&year=${y}`);
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadExchanges = useCallback(async () => {
    setLoadingExchanges(true);
    try {
      const res = await getShiftExchangeMyRequests();
      setMyExchanges(res.data?.data || []);
    } catch (e) {
      // ignore
    } finally {
      setLoadingExchanges(false);
    }
  }, []);

  useEffect(() => {
    loadCalendar(viewMonth, viewYear);
  }, [loadCalendar, viewMonth, viewYear]);

  useEffect(() => {
    if (activeTab === 'exchange') {
      loadExchanges();
    }
  }, [activeTab, loadExchanges]);

  async function refresh() {
    setRefreshing(true);
    if (activeTab === 'calendar') {
      await loadCalendar(viewMonth, viewYear);
    } else {
      await loadExchanges();
    }
    setRefreshing(false);
  }

  function goMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  async function changeDateInModal(newDateStr) {
    if (newDateStr < todayStr) return;
    setSelectedDate(newDateStr);
    setSelectedPartnerId(null);
    setSelectedShiftId(null);
    setLoadingRosterInfo(true);
    try {
      const info = await getShiftExchangeRosterInfo(newDateStr);
      setRosterInfo(info.data || null);
    } catch (e) {
      Alert.alert('Gagal', e.message || 'Tidak dapat memuat info shift pada tanggal tersebut.');
    } finally {
      setLoadingRosterInfo(false);
    }
  }

  async function openExchangeForDate(dateStr) {
    const targetDate = dateStr || todayStr;
    if (targetDate < todayStr) {
      Alert.alert('Info', 'Pengajuan tukar shift tidak dapat dilakukan untuk hari mundur (tanggal yang sudah lewat).');
      return;
    }
    setSelectedDate(targetDate);
    setSelectedPartnerId(null);
    setSelectedShiftId(null);
    setReason('');
    setExchangeMode('peer');
    setExchangeModalOpen(true);
    setLoadingRosterInfo(true);

    try {
      const info = await getShiftExchangeRosterInfo(targetDate);
      setRosterInfo(info.data || null);
    } catch (e) {
      Alert.alert('Gagal', e.message || 'Tidak dapat memuat info shift pada tanggal tersebut.');
      setExchangeModalOpen(false);
    } finally {
      setLoadingRosterInfo(false);
    }
  }

  async function handleSubmitExchange() {
    if (!selectedDate) {
      Alert.alert('Validasi', 'Pilih tanggal shift.');
      return;
    }
    if (exchangeMode === 'peer' && !selectedPartnerId) {
      Alert.alert('Validasi', 'Pilih rekan kerja yang ingin diajak bertukar shift.');
      return;
    }
    if (exchangeMode === 'direct' && !selectedShiftId) {
      Alert.alert('Validasi', 'Pilih shift baru yang diinginkan.');
      return;
    }
    if (!reason.trim() || reason.trim().length < 4) {
      Alert.alert('Validasi', 'Berikan alasan pengajuan tukar shift (minimal 4 karakter).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        date: selectedDate,
        target_user_id: exchangeMode === 'peer' ? selectedPartnerId : null,
        target_date: exchangeMode === 'peer' ? selectedDate : null,
        requested_shift_id: exchangeMode === 'direct' ? selectedShiftId : null,
        is_requested_day_off: false,
        reason: reason.trim(),
      };

      const res = await submitShiftExchangeRequest(payload);
      Alert.alert('Berhasil', res.message || 'Pengajuan tukar shift berhasil dikirim. Menunggu approval dari HR.');
      setExchangeModalOpen(false);
      setActiveTab('exchange');
      loadExchanges();
    } catch (e) {
      Alert.alert('Gagal Mengajukan', e.message || 'Terjadi kesalahan.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelExchange(id) {
    Alert.alert(
      'Batalkan Pengajuan',
      'Apakah kamu yakin ingin membatalkan permohonan tukar shift ini?',
      [
        { text: 'Tidak', style: 'cancel' },
        {
          text: 'Ya, Batalkan',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelShiftExchangeRequest(id);
              Alert.alert('Sukses', 'Pengajuan tukar shift berhasil dibatalkan.');
              loadExchanges();
            } catch (e) {
              Alert.alert('Gagal', e.message || 'Gagal membatalkan pengajuan.');
            }
          },
        },
      ]
    );
  }

  const isFuture =
    viewYear > new Date().getFullYear() ||
    (viewYear === new Date().getFullYear() && viewMonth > new Date().getMonth() + 1);

  if (error) return <Error message={error} onRetry={() => loadCalendar(viewMonth, viewYear)} />;
  if (!data && activeTab === 'calendar') return <Loading />;

  const attendances = data?.attendances || {};
  const rosters = data?.rosters || {};
  const myId = user?.id;

  const rosterByDate = {};
  (rosters[String(myId)] || []).forEach((r) => {
    rosterByDate[r.date] = r;
  });

  const cells = [];
  for (let d = 1; d <= (data?.daysInMonth || 31); d++) {
    const date = `${data?.year}-${String(data?.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = rosterByDate[date] || null;
    const isOff = !!(r && (r.is_day_off || !r.shift_id));
    cells.push({
      date,
      shift_id: isOff ? null : r?.shift_id,
      isOff,
      isPast: date < todayStr,
      isToday: date === todayStr,
    });
  }

  const shiftSet = new Set(cells.filter((c) => c.shift_id).map((c) => c.shift_id));

  return (
    <View style={styles.container}>
      {/* Topbar */}
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.monthCenter}>
          <Text style={styles.title}>Jadwal Kerja & Shift</Text>
          <Text style={styles.subtitle}>GGC Link Group</Text>
        </View>
        <View style={styles.backBtnPlaceholder} />
      </View>

      {/* Segmented Tab */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'calendar' && styles.tabBtnActive]}
          onPress={() => setActiveTab('calendar')}
        >
          <MaterialIcons
            name="calendar-today"
            size={16}
            color={activeTab === 'calendar' ? '#fff' : colors.muted}
          />
          <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>
            Roster Bulanan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'exchange' && styles.tabBtnActive]}
          onPress={() => setActiveTab('exchange')}
        >
          <MaterialIcons
            name="swap-horiz"
            size={18}
            color={activeTab === 'exchange' ? '#fff' : colors.muted}
          />
          <Text style={[styles.tabText, activeTab === 'exchange' && styles.tabTextActive]}>
            Tukar Shift
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Calendar Tab */}
      {activeTab === 'calendar' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <View style={styles.monthBar}>
            <TouchableOpacity style={styles.monthBtn} onPress={() => goMonth(-1)}>
              <MaterialIcons name="chevron-left" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.monthCenter2}>
              <Text style={styles.monthLabel}>
                {monthName(data.month)} {data.year}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.monthBtn, isFuture && styles.monthBtnDisabled]}
              onPress={() => goMonth(1)}
              disabled={isFuture}
            >
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={isFuture ? colors.muted : colors.text}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.gridCard}>
            <Text style={styles.gridHint}>
              💡 Tap pada tanggal hari ini / masa depan untuk mengajukan Tukar Shift
            </Text>
            <View style={styles.grid}>
              {cells.map((c) => {
                const canExchange = !c.isPast;
                return (
                  <TouchableOpacity
                    key={c.date}
                    disabled={!canExchange}
                    onPress={() => openExchangeForDate(c.date)}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: c.isOff
                          ? colors.border + '55'
                          : c.isToday
                          ? colors.accent + '33'
                          : colors.cardAlt,
                        borderColor: c.isToday ? colors.accent : 'transparent',
                        borderWidth: c.isToday ? 1.5 : 0,
                        opacity: c.isPast ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        { color: c.isToday ? colors.accentLight : colors.muted },
                      ]}
                    >
                      {c.date.slice(8)}
                    </Text>
                    <Text
                      style={[
                        styles.shiftLabel,
                        { color: c.isOff ? colors.muted : colors.accentLight },
                      ]}
                    >
                      {c.isOff ? 'OFF' : shiftShort(c.shift_id)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.legendCard}>
            {Array.from(shiftSet).map((sid) => (
              <View key={sid} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.accentLight }]} />
                <Text style={styles.legendText}>{shiftName(sid)}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
              <Text style={styles.legendText}>OFF / Libur</Text>
            </View>
          </View>

          {/* Quick Action Button */}
          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => openExchangeForDate(todayStr)}
          >
            <MaterialIcons name="swap-horiz" size={20} color="#fff" />
            <Text style={styles.requestBtnText}>Ajukan Tukar Shift</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* Content Shift Exchange History Tab */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => openExchangeForDate(todayStr)}
          >
            <MaterialIcons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.requestBtnText}>Buat Pengajuan Tukar Shift</Text>
          </TouchableOpacity>

          {loadingExchanges ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 20 }} />
          ) : myExchanges.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event-available" size={36} color={colors.muted} />
              <Text style={styles.emptyText}>Belum ada riwayat pengajuan tukar shift.</Text>
            </View>
          ) : (
            myExchanges.map((req) => {
              const statusColors = {
                pending: { bg: '#854d0e22', text: '#facc15', border: '#854d0e88', label: 'Menunggu HR' },
                approved: { bg: '#14532d22', text: '#4ade80', border: '#14532d88', label: 'Disetujui' },
                rejected: { bg: '#7f1d1d22', text: '#f87171', border: '#7f1d1d88', label: 'Ditolak' },
                expired: { bg: '#33415522', text: '#94a3b8', border: '#33415588', label: 'Kedaluwarsa' },
              };
              const st = statusColors[req.status] || statusColors.pending;

              return (
                <View key={req.id} style={styles.exchangeCard}>
                  <View style={styles.exchangeHeader}>
                    <View>
                      <Text style={styles.exchangeNo}>{req.request_number}</Text>
                      <Text style={styles.exchangeDate}>{req.date_formatted}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: st.bg, borderColor: st.border },
                      ]}
                    >
                      <Text style={[styles.statusBadgeText, { color: st.text }]}>
                        {st.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.exchangeBody}>
                    <Text style={styles.exchangeInfoRow}>
                      <Text style={{ color: colors.muted }}>Shift Asal: </Text>
                      <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                        {req.current_shift?.name || 'Regular'}
                      </Text>
                    </Text>

                    {req.target_partner ? (
                      <Text style={styles.exchangeInfoRow}>
                        <Text style={{ color: colors.accentLight }}>Tukar dgn: </Text>
                        <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                          {req.target_partner.fullname} ({req.target_partner.shift_name})
                        </Text>
                      </Text>
                    ) : req.requested_shift ? (
                      <Text style={styles.exchangeInfoRow}>
                        <Text style={{ color: '#38bdf8' }}>Shift Baru: </Text>
                        <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                          {req.requested_shift.name}
                        </Text>
                      </Text>
                    ) : null}

                    <Text style={styles.exchangeReason}>"{req.reason}"</Text>

                    {req.rejection_reason ? (
                      <Text style={styles.rejectReason}>
                        Alasan ditolak: {req.rejection_reason}
                      </Text>
                    ) : null}
                  </View>

                  {req.status === 'pending' && req.is_requester ? (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => handleCancelExchange(req.id)}
                    >
                      <Text style={styles.cancelBtnText}>Batalkan Pengajuan</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Modal Ajukan Tukar Shift */}
      <Modal
        visible={exchangeModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setExchangeModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Pengajuan Tukar Shift</Text>
                <Text style={styles.modalSubtitle}>Pilih tanggal shift yang ingin diajukan:</Text>
              </View>
              <TouchableOpacity onPress={() => setExchangeModalOpen(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Date selector chips */}
            <View style={{ marginBottom: 14 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {upcomingDays.map((item) => {
                  const isSelected = selectedDate === item.dateStr;
                  return (
                    <TouchableOpacity
                      key={item.dateStr}
                      onPress={() => changeDateInModal(item.dateStr)}
                      style={[
                        styles.dateChip,
                        isSelected && styles.dateChipActive,
                      ]}
                    >
                      <Text style={[styles.dateChipDay, isSelected && styles.dateChipTextActive]}>
                        {item.dayName}
                      </Text>
                      <Text style={[styles.dateChipDate, isSelected && styles.dateChipTextActive]}>
                        {item.dateNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {loadingRosterInfo ? (
              <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 14 }}>
                {/* Info Shift Saya Saat Ini */}
                <View style={styles.myShiftBox}>
                  <Text style={styles.boxLabel}>Shift Anda Saat Ini:</Text>
                  <Text style={styles.boxVal}>
                    {rosterInfo?.my_shift?.name || 'Regular'}
                    {rosterInfo?.my_shift?.start_time
                      ? ` (${rosterInfo.my_shift.start_time.slice(0, 5)} - ${rosterInfo.my_shift.end_time.slice(0, 5)})`
                      : ''}
                  </Text>
                </View>

                {/* Mode Pertukaran */}
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[
                      styles.modeBtn,
                      exchangeMode === 'peer' && styles.modeBtnActive,
                    ]}
                    onPress={() => setExchangeMode('peer')}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        exchangeMode === 'peer' && styles.modeBtnTextActive,
                      ]}
                    >
                      👥 Tukar Rekan Kerja
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeBtn,
                      exchangeMode === 'direct' && styles.modeBtnActive,
                    ]}
                    onPress={() => setExchangeMode('direct')}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        exchangeMode === 'direct' && styles.modeBtnTextActive,
                      ]}
                    >
                      🔄 Ganti Shift Mandiri
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Pilihan Rekan Kerja (Peer Swap) */}
                {exchangeMode === 'peer' ? (
                  <View>
                    <Text style={styles.inputLabel}>Pilih Rekan Bertukar:</Text>
                    {rosterInfo?.eligible_partners?.length === 0 ? (
                      <Text style={styles.emptyPeerText}>
                        Tidak ada rekan kerja di divisi/sub-divisi yang sama pada tanggal ini.
                      </Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {rosterInfo?.eligible_partners?.map((p) => {
                          const isSelected = selectedPartnerId === p.id;
                          return (
                            <TouchableOpacity
                              key={p.id}
                              style={[
                                styles.partnerItem,
                                isSelected && styles.partnerItemActive,
                              ]}
                              onPress={() => setSelectedPartnerId(p.id)}
                            >
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.partnerName,
                                    isSelected && { color: colors.accentLight },
                                  ]}
                                >
                                  {p.fullname}
                                </Text>
                                <Text style={styles.partnerShift}>
                                  Jadwal: {p.shift_name}
                                  {p.start_time
                                    ? ` (${p.start_time.slice(0, 5)} - ${p.end_time.slice(0, 5)})`
                                    : ''}
                                </Text>
                              </View>
                              {isSelected ? (
                                <MaterialIcons name="check-circle" size={20} color={colors.accentLight} />
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : (
                  /* Pilihan Shift Mandiri */
                  <View>
                    <Text style={styles.inputLabel}>Pilih Shift Baru yang Diinginkan:</Text>
                    <View style={{ gap: 8 }}>
                      {rosterInfo?.available_shifts?.map((s) => {
                        const isSelected = selectedShiftId === s.id;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.partnerItem,
                              isSelected && styles.partnerItemActive,
                            ]}
                            onPress={() => setSelectedShiftId(s.id)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.partnerName,
                                  isSelected && { color: colors.accentLight },
                                ]}
                              >
                                {s.name}
                              </Text>
                              <Text style={styles.partnerShift}>
                                Jam: {s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}
                              </Text>
                            </View>
                            {isSelected ? (
                              <MaterialIcons name="check-circle" size={20} color={colors.accentLight} />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Input Alasan */}
                <View>
                  <Text style={styles.inputLabel}>Alasan Tukar Shift:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Contoh: Ada keperluan keluarga mendadak di pagi hari..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    value={reason}
                    onChangeText={setReason}
                  />
                </View>

                {/* Info Validasi 2 Hari */}
                <Text style={styles.noticeText}>
                  ⏳ Permohonan ini akan diteruskan ke Tim HR. Jika dalam 2 hari (48 jam) tidak direspon, sistem akan menolaknya secara otomatis.
                </Text>

                {/* Tombol Kirim */}
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                  disabled={submitting}
                  onPress={handleSubmitExchange}
                >
                  <Text style={styles.submitBtnText}>
                    {submitting ? 'Mengirim...' : 'Kirim Pengajuan ke HR'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  monthCenter: {
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnDisabled: {
    opacity: 0.4,
  },
  monthCenter2: {
    flex: 1,
    alignItems: 'center',
  },
  monthLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  gridCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  gridHint: {
    color: colors.accentLight,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  cell: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 8,
    opacity: 0.8,
  },
  shiftLabel: {
    fontSize: 8,
    fontWeight: '800',
  },
  legendCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.muted,
    fontSize: 10,
  },
  requestBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  requestBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
  },
  exchangeCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  exchangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exchangeNo: {
    color: colors.accentLight,
    fontWeight: 'bold',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  exchangeDate: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  exchangeBody: {
    backgroundColor: colors.cardAlt,
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  exchangeInfoRow: {
    fontSize: 11,
  },
  exchangeReason: {
    color: colors.text,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
  rejectReason: {
    color: '#f87171',
    fontSize: 10,
    marginTop: 4,
  },
  cancelBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#7f1d1d33',
    borderWidth: 1,
    borderColor: '#7f1d1d66',
  },
  cancelBtnText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  myShiftBox: {
    backgroundColor: colors.cardAlt,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boxLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  boxVal: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeBtnActive: {
    backgroundColor: colors.accent + '33',
    borderColor: colors.accent,
  },
  modeBtnText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: colors.accentLight,
    fontWeight: 'bold',
  },
  inputLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptyPeerText: {
    color: colors.muted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  partnerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerItemActive: {
    borderColor: colors.accentLight,
    backgroundColor: colors.accent + '22',
  },
  partnerName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  partnerShift: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 1,
  },
  textInput: {
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 10,
    color: colors.text,
    fontSize: 12,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  noticeText: {
    color: '#facc15',
    fontSize: 10,
    lineHeight: 14,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    minWidth: 62,
  },
  dateChipActive: {
    backgroundColor: colors.accent + '33',
    borderColor: colors.accent,
  },
  dateChipDay: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600',
  },
  dateChipDate: {
    fontSize: 12,
    color: colors.text,
    fontWeight: 'bold',
    marginTop: 1,
  },
  dateChipTextActive: {
    color: colors.accentLight,
  },
});
