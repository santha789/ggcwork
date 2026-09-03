import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getPage } from '../api';
import { MaterialIcons } from '@expo/vector-icons';
import { Loading, Error } from '../components';
import { colors } from '../theme';
import { downloadPayrollPdf, printPayrollSlip } from '../payrollPdf';

function monthName(m) {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return names[(m || 1) - 1] || m;
}

function fmtRp(v) {
  const n = Number(v);
  if (isNaN(n)) return '-';
  return 'Rp ' + n.toLocaleString('id-ID');
}

function statusInfo(status) {
  if (status === 'paid') return { label: 'DIBERIKAN', color: colors.green };
  if (status === 'approved') return { label: 'DISETUJUI', color: colors.accentLight };
  return { label: 'DRAFT', color: colors.yellow };
}

export default function PayrollScreen({ user, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  const load = useCallback(async (m, y) => {
    try {
      const props = await getPage(`/payroll?month=${m}&year=${y}`);
      setData(props);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load(viewMonth, viewYear);
  }, [load, viewMonth, viewYear]);

  async function refresh() {
    setRefreshing(true);
    await load(viewMonth, viewYear);
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

  const isFuture =
    viewYear > new Date().getFullYear() ||
    (viewYear === new Date().getFullYear() && viewMonth > new Date().getMonth() + 1);

  if (error) return <Error message={error} onRetry={() => load(viewMonth, viewYear)} />;
  if (!data) return <Loading />;

  const payrolls = Array.isArray(data.payrolls)
    ? data.payrolls
    : data.payrolls?.data || [];

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Slip Gaji</Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      <View style={styles.monthBar}>
        <TouchableOpacity style={styles.monthBtn} onPress={() => goMonth(-1)}>
          <MaterialIcons name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {monthName(viewMonth)} {viewYear}
        </Text>
        <TouchableOpacity
          style={[styles.monthBtn, isFuture && styles.monthBtnDisabled]}
          onPress={() => goMonth(1)}
          disabled={isFuture}
        >
          <MaterialIcons name="chevron-right" size={22} color={isFuture ? colors.muted : colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {payrolls.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="receipt-long" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>
              Belum ada slip gaji untuk {monthName(viewMonth)} {viewYear}
            </Text>
          </View>
        ) : (
          payrolls.map((p) => <PayrollCard key={p.id} pay={p} />)
        )}
      </ScrollView>
    </View>
  );
}

function PayrollCard({ pay }) {
  const st = statusInfo(pay.status);
  const comps = pay.payroll_components || pay.payrollComponents || [];
  const allowances = comps.filter((c) => c.type === 'allowance');
  const deductions = comps.filter((c) => c.type === 'deduction');
  const u = pay.user || {};
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  // Calculate gross and deduction subtotal
  const grossTotal = Number(pay.gross_salary || 0) || (
    Number(pay.base_salary || 0) +
    allowances.reduce((acc, c) => acc + Number(c.amount || 0), 0) +
    Number(pay.overtime_amount || 0)
  );

  const deductionTotal = Number(pay.total_deduction || 0) || (
    deductions.reduce((acc, c) => acc + Number(c.amount || 0), 0) +
    Number(pay.tax_amount || 0)
  );

  async function doDownload() {
    if (busy) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const detail = await getPage(`/payroll/${pay.id}`);
      const full = detail.payroll || detail.payrolls || pay;
      await downloadPayrollPdf(full);
      setOk('PDF tersimpan di folder Download.');
    } catch (e) {
      setErr(e.message || 'Gagal membuat PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function doPrint() {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const detail = await getPage(`/payroll/${pay.id}`);
      const full = detail.payroll || detail.payrolls || pay;
      await printPayrollSlip(full);
    } catch (e) {
      setErr(e.message || 'Gagal membuka print dialog.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      {/* Top Header */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.periodLabel}>
            Slip Gaji • {monthName(pay.period_month)} {pay.period_year}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: st.color }]} />
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
            {pay.payment_date ? (
              <Text style={styles.payDateText}>
                • {new Date(pay.payment_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.netBlock}>
          <Text style={styles.netLabel}>Gaji Bersih (THP)</Text>
          <Text style={styles.netValue}>{fmtRp(pay.net_salary)}</Text>
        </View>
      </View>

      {/* Attendance & Bank info */}
      <View style={styles.metaBox}>
        <View style={styles.metaRow}>
          <MaterialIcons name="event-available" size={15} color={colors.accentLight} />
          <Text style={styles.metaText}>
            Presensi: <Text style={styles.metaBold}>{pay.total_attendance_days || 0} Hari</Text> / {pay.total_working_days || 0} Hari Kerja
          </Text>
        </View>
        <View style={styles.metaRow}>
          <MaterialIcons name="account-balance" size={15} color={colors.accentLight} />
          <Text style={styles.metaText}>
            Transfer: <Text style={styles.metaBold}>{u.bank_name || 'BCA'}</Text> ({u.bank_account || '-'})
          </Text>
        </View>
      </View>

      {/* SECTION A: PENERIMAAN (INCOME) */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleGreen}>A. PENERIMAAN (INCOME)</Text>
          <Text style={styles.sectionSubTitleGreen}>JUMLAH</Text>
        </View>

        <View style={styles.line}>
          <Text style={styles.lineLabel}>Gaji Pokok</Text>
          <Text style={[styles.lineValue, { color: colors.green }]}>+ {fmtRp(pay.base_salary)}</Text>
        </View>

        {allowances.map((c) => (
          <View key={c.id} style={styles.line}>
            <Text style={styles.lineLabel}>{c.name}</Text>
            <Text style={[styles.lineValue, { color: colors.green }]}>+ {fmtRp(c.amount)}</Text>
          </View>
        ))}

        {Number(pay.overtime_amount || 0) > 0 && (
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Lembur ({pay.overtime_hours} Jam)</Text>
            <Text style={[styles.lineValue, { color: colors.green }]}>+ {fmtRp(pay.overtime_amount)}</Text>
          </View>
        )}

        <View style={styles.subtotalLine}>
          <Text style={styles.subtotalLabelGreen}>Total Penerimaan (Gross)</Text>
          <Text style={styles.subtotalValueGreen}>{fmtRp(grossTotal)}</Text>
        </View>
      </View>

      {/* SECTION B: POTONGAN (DEDUCTIONS) */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleRed}>B. POTONGAN (DEDUCTION)</Text>
          <Text style={styles.sectionSubTitleRed}>JUMLAH</Text>
        </View>

        {deductions.length > 0 ? (
          deductions.map((c) => (
            <View key={c.id} style={styles.line}>
              <Text style={styles.lineLabel}>{c.name}</Text>
              <Text style={[styles.lineValue, { color: colors.red }]}>- {fmtRp(c.amount)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyNote}>Tidak ada potongan pada periode ini.</Text>
        )}

        {Number(pay.tax_amount || 0) > 0 && (
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Pajak (PPh)</Text>
            <Text style={[styles.lineValue, { color: colors.red }]}>- {fmtRp(pay.tax_amount)}</Text>
          </View>
        )}

        <View style={styles.subtotalLine}>
          <Text style={styles.subtotalLabelRed}>Total Potongan</Text>
          <Text style={styles.subtotalValueRed}>- {fmtRp(deductionTotal)}</Text>
        </View>
      </View>

      {/* TAKE HOME PAY SUMMARY */}
      <View style={styles.thpCard}>
        <View>
          <Text style={styles.thpTitle}>GAJI BERSIH DITERIMA (THP)</Text>
          <Text style={styles.thpSub}>Total transfer resmi PT GGCLINK</Text>
        </View>
        <Text style={styles.thpValue}>{fmtRp(pay.net_salary)}</Text>
      </View>

      {pay.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Catatan:</Text>
          <Text style={styles.notesText}>{pay.notes}</Text>
        </View>
      ) : null}

      {err ? <Text style={styles.dlError}>{err}</Text> : null}

      {/* Action Buttons Row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.dlBtn, styles.dlBtnPrimary, busy && styles.dlBtnBusy]}
          onPress={doDownload}
          disabled={busy}
          activeOpacity={0.8}
        >
          <MaterialIcons name="picture-as-pdf" size={18} color="#fff" />
          <Text style={styles.dlBtnText}>
            {busy ? 'Menyiapkan...' : 'Buka / Simpan PDF'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dlBtn, styles.dlBtnSecondary, busy && styles.dlBtnBusy]}
          onPress={doPrint}
          disabled={busy}
          activeOpacity={0.8}
        >
          <MaterialIcons name="print" size={18} color={colors.accentLight} />
          <Text style={styles.dlBtnTextSecondary}>Cetak</Text>
        </TouchableOpacity>
      </View>
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
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
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
  monthLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    gap: 12,
    paddingBottom: 20,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  periodLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  netBlock: {
    alignItems: 'flex-end',
  },
  netLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  netValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: 'bold',
  },
  payDateText: {
    fontSize: 10,
    color: colors.muted,
  },
  metaBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 11,
    color: colors.muted,
  },
  metaBold: {
    color: colors.text,
    fontWeight: 'bold',
  },
  sectionBox: {
    backgroundColor: colors.cardAlt + '88',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  sectionTitleGreen: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 0.5,
  },
  sectionSubTitleGreen: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
  },
  sectionTitleRed: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#f87171',
    letterSpacing: 0.5,
  },
  sectionSubTitleRed: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#f87171',
  },
  emptyNote: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    paddingVertical: 2,
  },
  subtotalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    marginTop: 2,
  },
  subtotalLabelGreen: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#34d399',
  },
  subtotalValueGreen: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#34d399',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subtotalLabelRed: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#f87171',
  },
  subtotalValueRed: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#f87171',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thpCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#064e3b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#059669',
  },
  thpTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6ee7b7',
    letterSpacing: 0.5,
  },
  thpSub: {
    fontSize: 9,
    color: '#a7f3d0',
    marginTop: 1,
  },
  thpValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  notesBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 11,
    color: colors.text,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineLabel: {
    color: colors.muted,
    fontSize: 12,
    flex: 1,
  },
  lineValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  dlError: {
    color: colors.red,
    fontSize: 12,
  },
  dlOk: {
    color: colors.green,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  dlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  dlBtnPrimary: {
    flex: 1.5,
    backgroundColor: colors.accent,
  },
  dlBtnSecondary: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dlBtnBusy: {
    opacity: 0.6,
  },
  dlBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dlBtnTextSecondary: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '700',
  },
});
