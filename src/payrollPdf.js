import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import { EncodingType, readAsStringAsync, makeDirectoryAsync, documentDirectory } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
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

function buildSlipHtml(p) {
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
          <td class="num green">${fmtRp(c.amount)}</td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="2" class="empty">Tidak ada rincian penerimaan.</td></tr>`;

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
    : `<tr><td colspan="2" class="empty">Tidak ada potongan.</td></tr>`;

  const overtimeRow =
    Number(p.overtime_amount || 0) > 0
      ? `<tr><td>Lembur (${p.overtime_hours} jam)</td><td class="num green">+ ${fmtRp(p.overtime_amount)}</td></tr>`
      : '';

  const taxRow =
    Number(p.tax_amount || 0) > 0
      ? `<tr><td>Pajak</td><td class="num red">- ${fmtRp(p.tax_amount)}</td></tr>`
      : '';

  const bankLabel = u.bank_name ? esc(u.bank_name) : 'BCA (014)';
  const bankAccount =
    u.bank_name === 'Tunai / Cash'
      ? 'Pembayaran Tunai (Cash)'
      : u.bank_account
      ? esc(u.bank_account)
      : '-';

  const statusLabel =
    p.status === 'paid' ? 'PAID / DIBERIKAN' : p.status === 'approved' ? 'APPROVED / DISETUJUI' : 'DRAFT';

  return `
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; padding: 28px; }
    .kop {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #cbd5e1; padding-bottom: 16px; margin-bottom: 18px;
    }
    .kop h2 { font-size: 15px; letter-spacing: 0.5px; margin-bottom: 4px; }
    .kop p { font-size: 9px; color: #475569; line-height: 1.5; }
    .kop-right { text-align: right; }
    .kop-right h3 { font-size: 14px; letter-spacing: 2px; margin-bottom: 4px; color: #1d4ed8; }
    .kop-right p { font-size: 10px; font-weight: bold; }
    .badge {
      display: inline-block; margin-top: 6px; padding: 3px 10px;
      border: 1px solid #34d399; border-radius: 999px;
      font-size: 10px; font-weight: bold; color: #047857; background: #d1fae5;
    }
    .meta {
      display: flex; gap: 24px; background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 12px; padding: 14px 16px; margin-bottom: 18px;
    }
    .meta > div { flex: 1; }
    .meta .lbl { font-size: 9px; color: #64748b; font-weight: 500; }
    .meta .val { font-size: 12px; font-weight: bold; margin-top: 2px; }
    .cols { display: flex; gap: 16px; }
    .col { flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
    .col h4 {
      font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
      padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; margin-bottom: 6px;
      display: flex; justify-content: space-between;
    }
    .col.green h4 { color: #047857; }
    .col.red h4 { color: #be123c; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 11px; padding: 4px 0; }
    td.num { text-align: right; font-weight: 600; font-family: monospace; }
    .green { color: #047857; }
    .red { color: #be123c; }
    .empty { color: #94a3b8; font-style: italic; }
    .total-col {
      border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 8px;
      display: flex; justify-content: space-between; font-weight: bold; font-size: 11px;
    }
    .thp {
      display: flex; justify-content: space-between; align-items: center;
      background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 16px; margin-top: 18px;
    }
    .thp .lbl { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .thp .sub { font-size: 9px; color: #64748b; margin-top: 2px; }
    .thp .val { font-size: 26px; font-weight: 900; color: #047857; font-family: monospace; }
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
      <div class="lbl">Presensi</div>
      <div class="val">${p.total_attendance_days} Hari / ${p.total_working_days} Hari Kerja</div>
    </div>
    <div>
      <div class="lbl">Bank Transfer</div>
      <div class="val">${bankLabel}</div>
    </div>
    <div>
      <div class="lbl">No. Rekening</div>
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
        <span>${fmtRp(p.gross_salary)}</span>
      </div>
    </div>
    <div class="col red">
      <h4><span>B. Potongan (Kasbon / BPJS / Denda)</span><span>Jumlah</span></h4>
      <table>
        ${deductionRows}
        ${taxRow}
      </table>
      <div class="total-col red">
        <span>Total Potongan:</span>
        <span>- ${fmtRp(p.total_deduction)}</span>
      </div>
    </div>
  </div>

  <div class="thp">
    <div>
      <div class="lbl">Gaji Bersih Diterima (Take Home Pay / THP)</div>
      <div class="sub">Total Pembayaran Resmi Gaji Karyawan</div>
    </div>
    <div class="val">${fmtRp(p.net_salary)}</div>
  </div>
</body>
</html>`;
}

async function getDownloadDir() {
  // Try to get the Download directory directly on Android
  if (Platform.OS === 'android') {
    const dl = Paths.download;
    if (dl) {
      try {
        // Ensure the directory exists
        const info = await new File(dl).exists();
        if (!info) {
          await makeDirectoryAsync(dl, { intermediates: true }).catch(() => {});
        }
        return dl;
      } catch (e) {
        // fallback
      }
    }
    // Fallback: use document directory
    const dl2 = documentDirectory + 'Download';
    try {
      await makeDirectoryAsync(dl2, { intermediates: true }).catch(() => {});
    } catch (e) {}
    return dl2;
  }
  return documentDirectory;
}

export async function downloadPayrollPdf(p) {
  const html = buildSlipHtml(p);
  const { uri } = await Print.printToFileAsync({ html });

  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const filename = `slip-gaji-${p.period_month}-${p.period_year}.pdf`;

  const dirUri = await getDownloadDir();
  const fileUri = `${dirUri}/${filename}`;

  const f = new File(fileUri);
  try {
    await f.write(base64, { encoding: EncodingType.Base64 });
  } catch (e) {
    const created = await File.createFile(dirUri, filename, true);
    await created.write(base64, { encoding: EncodingType.Base64 });
  }

  try {
    new File(uri).delete();
  } catch (e) {}

  // Store file URI for notification tap handler
  await AsyncStorage.setItem(DL_FILE_KEY, fileUri);

  // Show download-complete notification like a browser
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Download selesai',
      body: filename,
      data: { action: 'OPEN_DOWNLOAD', fileUri },
      sound: false,
      ...(Platform.OS === 'android' ? { channelId: 'downloads' } : {}),
    },
    trigger: null,
  });

  return { uri: fileUri, filename };
}

export async function openLastDownload() {
  try {
    const fileUri = await AsyncStorage.getItem(DL_FILE_KEY);
    if (!fileUri) return false;
    const exists = await new File(fileUri).exists();
    if (!exists) return false;
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Buka Slip Gaji',
      UTI: 'com.adobe.pdf',
    });
    return true;
  } catch (e) {
    return false;
  }
}
