import * as Print from 'expo-print';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DL_FILE_KEY = '@ggcwork/last-download-pdf';

function fmtRp(v) {
  const n = Number(v);
  if (isNaN(n)) return '-';
  return 'Rp ' + n.toLocaleString('id-ID');
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function monthName(m) {
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return names[(m || 1) - 1] || m;
}

export function buildSlipHtml(p) {
  const u = p.user || {};
  const comps = p.payroll_components || [];
  const allowances = comps.filter((c) => c.type === 'allowance');
  const deductions = comps.filter((c) => c.type === 'deduction');

  const incomeRows = allowances.length
    ? allowances
        .map(
          (c) => `
        <tr>
          <td>${esc(c.name)}</td>
          <td class="num green">+ ${fmtRp(c.amount)}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="2" class="empty">Tidak ada rincian penerimaan lain.</td></tr>`;

  const deductionRows = deductions.length
    ? deductions
        .map(
          (c) => `
        <tr>
          <td>${esc(c.name)}</td>
          <td class="num red">- ${fmtRp(c.amount)}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="2" class="empty">Tidak ada potongan pada periode ini.</td></tr>`;

  const overtimeRow =
    Number(p.overtime_amount || 0) > 0
      ? `<tr><td>Lembur (${p.overtime_hours} jam)</td><td class="num green">+ ${fmtRp(p.overtime_amount)}</td></tr>`
      : '';

  const taxRow =
    Number(p.tax_amount || 0) > 0
      ? `<tr><td>Pajak (PPh)</td><td class="num red">- ${fmtRp(p.tax_amount)}</td></tr>`
      : '';

  const bankLabel = u.bank_name ? esc(u.bank_name) : 'BCA (014)';
  const bankAccount =
    u.bank_name === 'Tunai / Cash'
      ? 'Pembayaran Tunai (Cash)'
      : u.bank_account
      ? esc(u.bank_account)
      : '-';

  const statusLabel =
    p.status === 'paid' ? 'PAID (LUNAS)' : p.status === 'approved' ? 'APPROVED (DISETUJUI)' : 'DRAFT';

  const grossTotal = Number(p.gross_salary || 0) || (
    Number(p.base_salary || 0) +
    allowances.reduce((acc, c) => acc + Number(c.amount || 0), 0) +
    Number(p.overtime_amount || 0)
  );

  const deductionTotal = Number(p.total_deduction || 0) || (
    deductions.reduce((acc, c) => acc + Number(c.amount || 0), 0) +
    Number(p.tax_amount || 0)
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Slip Gaji - ${esc(u.fullname || 'Karyawan')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; padding: 24px; background: #fff; line-height: 1.4; }
    .kop {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 16px;
    }
    .kop h2 { font-size: 15px; font-weight: 800; letter-spacing: 0.5px; color: #0f172a; text-transform: uppercase; }
    .kop p { font-size: 9px; color: #475569; margin-top: 3px; line-height: 1.4; }
    .kop-right { text-align: right; }
    .kop-right h3 { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; color: #2563eb; text-transform: uppercase; }
    .kop-right p { font-size: 10px; font-weight: bold; margin-top: 2px; }
    .badge {
      display: inline-block; margin-top: 5px; padding: 2px 8px;
      border: 1px solid #10b981; border-radius: 4px;
      font-size: 9px; font-weight: bold; color: #065f46; background: #d1fae5;
    }
    .meta {
      display: flex; flex-wrap: wrap; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;
    }
    .meta > div { flex: 1 1 30%; min-width: 140px; }
    .meta .lbl { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .meta .val { font-size: 11.5px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .cols { display: flex; gap: 14px; }
    .col { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fafafa; }
    .col h4 {
      font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
      padding-bottom: 6px; border-bottom: 1.5px solid #e2e8f0; margin-bottom: 6px;
      display: flex; justify-content: space-between;
    }
    .col.green h4 { color: #047857; border-bottom-color: #a7f3d0; }
    .col.red h4 { color: #b91c1c; border-bottom-color: #fecaca; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 10.5px; padding: 4px 0; color: #334155; }
    td.num { text-align: right; font-weight: 600; font-family: monospace; font-size: 11px; }
    .green { color: #047857; }
    .red { color: #b91c1c; }
    .empty { color: #94a3b8; font-style: italic; font-size: 10px; }
    .total-col {
      border-top: 1.5px solid #cbd5e1; margin-top: 8px; padding-top: 6px;
      display: flex; justify-content: space-between; font-weight: 800; font-size: 11px;
    }
    .thp {
      display: flex; justify-content: space-between; align-items: center;
      background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px;
      padding: 14px 16px; margin-top: 16px;
    }
    .thp .lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #065f46; }
    .thp .sub { font-size: 9px; color: #047857; margin-top: 2px; }
    .thp .val { font-size: 22px; font-weight: 900; color: #047857; font-family: monospace; }
    .footer {
      margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .footer-note { font-size: 8.5px; color: #64748b; line-height: 1.4; max-width: 60%; }
    .sig { text-align: center; }
    .sig-title { font-size: 9px; font-weight: 600; color: #475569; }
    .sig-space { height: 40px; }
    .sig-name { font-size: 10.5px; font-weight: 800; text-decoration: underline; color: #0f172a; }
  </style>
</head>
<body>
  <div class="kop">
    <div>
      <h2>PT. GGCLINK RETAIL SOLUSINDO</h2>
      <p>
        Head Office: Jl. Swadaya No 01 RT05 RW05 Cikempong, Pakansari, Cibinong, Kab. Bogor, Jawa Barat<br />
        Telp: 021 - 50116093 | Email: cs_id@ggclinknetworks.com | Web: www.ggclinknetworks.com
      </p>
    </div>
    <div class="kop-right">
      <h3>SLIP GAJI KARYAWAN</h3>
      <p>Periode: ${monthName(p.period_month)} ${p.period_year}</p>
      <span class="badge">Status: ${statusLabel}</span>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="lbl">Nama Karyawan</div>
      <div class="val">${esc(u.fullname || '-')}</div>
    </div>
    <div>
      <div class="lbl">NIP / ID Karyawan</div>
      <div class="val">${esc(u.employee_id || '-')}</div>
    </div>
    <div>
      <div class="lbl">Divisi &amp; Jabatan</div>
      <div class="val">${esc(u.sub_division?.name || u.division?.name || '-')}${u.position?.name ? ' - ' + esc(u.position.name) : ''}</div>
    </div>
    <div>
      <div class="lbl">Presensi Kehadiran</div>
      <div class="val">${p.total_attendance_days || 0} Hari / ${p.total_working_days || 0} Hari Kerja</div>
    </div>
    <div>
      <div class="lbl">Bank Transfer</div>
      <div class="val">${bankLabel}</div>
    </div>
    <div>
      <div class="lbl">No. Rekening Tujuan</div>
      <div class="val">${bankAccount}</div>
    </div>
  </div>

  <div class="cols">
    <div class="col green">
      <h4><span>A. Penerimaan (Income)</span><span>Jumlah</span></h4>
      <table>
        <tr><td>Gaji Pokok</td><td class="num green">+ ${fmtRp(p.base_salary)}</td></tr>
        ${incomeRows}
        ${overtimeRow}
      </table>
      <div class="total-col green">
        <span>Total Penerimaan (Gross):</span>
        <span>${fmtRp(grossTotal)}</span>
      </div>
    </div>
    <div class="col red">
      <h4><span>B. Potongan (Deductions)</span><span>Jumlah</span></h4>
      <table>
        ${deductionRows}
        ${taxRow}
      </table>
      <div class="total-col red">
        <span>Total Potongan:</span>
        <span>- ${fmtRp(deductionTotal)}</span>
      </div>
    </div>
  </div>

  <div class="thp">
    <div>
      <div class="lbl">Gaji Bersih Diterima (Take Home Pay / THP)</div>
      <div class="sub">Dokumen resmi penggajian PT GGCLINK RETAIL SOLUSINDO</div>
    </div>
    <div class="val">${fmtRp(p.net_salary)}</div>
  </div>

  <div class="footer">
    <div class="footer-note">
      * Dokumen ini dibuat secara elektronik dan sah tanpa tanda tangan basah.<br />
      Dicetak melalui aplikasi resmi GGC Work pada ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.
    </div>
    <div class="sig">
      <div class="sig-title">HR &amp; Finance Management</div>
      <div class="sig-space"></div>
      <div class="sig-name">PT. GGCLINK RETAIL SOLUSINDO</div>
    </div>
  </div>
</body>
</html>`;
}

export async function downloadPayrollPdf(p) {
  const html = buildSlipHtml(p);
  const filename = `slip-gaji-${p.period_month}-${p.period_year}.pdf`;

  // 1. Generate real PDF file using expo-print
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  // 2. Save last generated PDF file uri
  await AsyncStorage.setItem(DL_FILE_KEY, uri);

  // 3. Immediately launch Android/iOS native file share & save dialog
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Slip Gaji ${monthName(p.period_month)} ${p.period_year}`,
      UTI: 'com.adobe.pdf',
    });
  }

  return { uri, filename };
}

export async function printPayrollSlip(p) {
  const html = buildSlipHtml(p);
  // Directly opens Android/iOS print spooler (where user can also tap "Save as PDF")
  await Print.printAsync({ html });
}

export async function openLastDownload() {
  try {
    const fileUri = await AsyncStorage.getItem(DL_FILE_KEY);
    if (!fileUri) return false;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Buka Slip Gaji',
        UTI: 'com.adobe.pdf',
      });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
