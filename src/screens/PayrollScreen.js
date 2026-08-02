import { useCallback, useEffect, useState } from 'react';
import {
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
import { downloadPayrollPdf } from '../payrollPdf';

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

  const payrolls = data.payrolls || [];

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
        )}      </ScrollView>
    </View>
  );
}

function PayrollCard({ pay }) {
  const st = statusInfo(pay.status);
  const comps = pay.payroll_components || [];
  const allowances = comps.filter((c) => c.type === 'allowance');
  const deductions = comps.filter((c) => c.type === 'deduction');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

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

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.periodLabel}>
            {monthName(pay.period_month)} {pay.period_year}
          </Text>
          <Text style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: st.color }]} />
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </Text>
        </View>
        <View style={styles.netBlock}>
          <Text style={styles.netLabel}>Gaji Bersih</Text>
          <Text style={styles.netValue}>{fmtRp(pay.net_salary)}</Text>
        </View>
      </View>

      <View style={styles.attendanceRow}>
        <Text style={styles.attText}>
          Kehadiran {pay.total_attendance_days || 0} hari dari{' '}
          {pay.total_working_days || 0} hari kerja
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.line}>
        <Text style={styles.lineLabel}>Gaji Pokok</Text>
        <Text style={styles.lineValue}>+ {fmtRp(pay.base_salary)}</Text>
      </View>

      {allowances.length > 0 && (
        <View style={styles.comps}>
          {allowances.map((c) => (
            <View key={c.id} style={styles.line}>
              <Text style={styles.lineLabel}>{c.name}</Text>
              <Text style={[styles.lineValue, { color: colors.green }]}>+ {fmtRp(c.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {Number(pay.overtime_amount || 0) > 0 && (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Lembur ({pay.overtime_hours} jam)</Text>
          <Text style={[styles.lineValue, { color: colors.green }]}>+ {fmtRp(pay.overtime_amount)}</Text>
        </View>
      )}

      {Number(pay.total_allowance || 0) > 0 &&
        allowances.length === 0 && (
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Tunjangan</Text>
            <Text style={[styles.lineValue, { color: colors.green }]}>+ {fmtRp(pay.total_allowance)}</Text>
          </View>
        )}

      {deductions.length > 0 && (
        <View style={styles.comps}>
          {deductions.map((c) => (
            <View key={c.id} style={styles.line}>
              <Text style={styles.lineLabel}>{c.name}</Text>
              <Text style={[styles.lineValue, { color: colors.red }]}>- {fmtRp(c.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {Number(pay.total_deduction || 0) > 0 &&
        deductions.length === 0 && (
          <View style={styles.line}>
            <Text style={styles.lineLabel}>Potongan</Text>
            <Text style={[styles.lineValue, { color: colors.red }]}>- {fmtRp(pay.total_deduction)}</Text>
          </View>
        )}

      {Number(pay.tax_amount || 0) > 0 && (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Pajak</Text>
          <Text style={[styles.lineValue, { color: colors.red }]}>- {fmtRp(pay.tax_amount)}</Text>
        </View>
      )}

      <View style={styles.divider} />
      <View style={styles.line}>
        <Text style={styles.totalLabel}>Total Diterima</Text>
        <Text style={[styles.totalValue, { color: st.color }]}>{fmtRp(pay.net_salary)}</Text>
      </View>

      {err ? <Text style={styles.dlError}>{err}</Text> : null}
      {ok ? <Text style={styles.dlOk}>{ok}</Text> : null}
      <TouchableOpacity
        style={[styles.dlBtn, busy && styles.dlBtnBusy]}
        onPress={doDownload}
        disabled={busy}
        activeOpacity={0.8}
      >
        <MaterialIcons name="picture-as-pdf" size={18} color="#fff" />
        <Text style={styles.dlBtnText}>
          {busy ? 'Menyiapkan PDF...' : 'Download / Simpan PDF'}
        </Text>
      </TouchableOpacity>
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
  attendanceRow: {
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  attText: {
    color: colors.muted,
    fontSize: 11,
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
    fontSize: 13,
  },
  lineValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  comps: {
    gap: 8,
  },
  totalLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  dlError: {
    color: colors.red,
    fontSize: 12,
  },
  dlOk: {
    color: colors.green,
    fontSize: 12,
  },
  dlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 12,
  },
  dlBtnBusy: {
    opacity: 0.6,
  },
  dlBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
