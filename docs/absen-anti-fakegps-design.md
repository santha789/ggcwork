# Desain Fitur Absen Smartphone + Jebakan Anti Fake GPS

**Status:** Desain — belum diimplementasi (menunggu izin backend + dev-build)
**Penulis:** GGC Work team
**Tanggal:** 2026-08-03

---

## 1. Tujuan

1. Karyawan absen masuk/pulang langsung dari aplikasi.
2. Absen hanya sah bila perangkat berada dalam radius **100 meter** dari titik koordinat kantor yang ditentukan.
3. Wajib **foto selfie** saat absen (bukti kehadiran fisik).
4. Mendeteksi **fake GPS** (lokasi palsu). Kalau ketahuan:
   - Akun **langsung dikunci** dan hanya admin yang bisa membuka.
   - Muncul layar pemberitahuan: "lapor HR" + permintaan maaf karena telah bersikap curang.
   - **Email laporan otomatis** ke Direktur, Wakil Direktur, VP, HR, dan ikhsandwirana@gmail.com.
   - Mempengaruhi **penilaian performansi** karyawan.
5. Tidak bisa diakali: fake GPS memang bisa dipakai, tapi konsekuensinya berat.

---

## 2. Alur Absen (Normal)

```
Tombol ABSEN (tab tengah)
   │
   ├─ 1. Cek izin GPS      (expo-location, foreground)
   ├─ 2. Cek izin Kamera   (expo-camera)
   ├─ 3. Ambil koordinat GPS saat ini (dengan timeout + akurasi min)
   ├─ 4. Deteksi fake GPS  (lihat §4) ── jika terbukti palsu ──► §5 JEBATAN
   ├─ 5. Hitung jarak ke titik kantor (rumus haversine) <= 100 m ?
   │        ├─ TIDAK ──► layar merah "DI LUAR AREA" + jarak yang terukur
   │        └─ YA
   ├─ 6. Buka kamera selfie, wajah harus terdeteksi & frame disimpan
   ├─ 7. Tampilkan ringkasan: jam, koordinat, jarak, foto, jenis (masuk/pulang)
   ├─ 8. Konfirmasi ──► POST ke server (endpoint absen baru)
   └─ 9. Sukses ──► kartu hijau "Absen Berhasil" + data riwayat hari ini
```

Data yang dikirim ke server saat absen (semua di-sign oleh app agar sulit dipalsukan):
- `employee_id`
- `latitude`, `longitude`, `accuracy`, `altitude`
- `timestamp`
- `distance_from_office` (dihitung ulang di server, JANGAN percaya nilai dari client)
- `photo_base64` (selfie)
- `session_token` (dari login) + `anti_tamper_signature` (lihat §8)

> **Aturan utama:** server HARUS menghitung ulang jarak sendiri dari koordinat yang dikirim. Radius dicek **dua kali** (client untuk UX cepat, server untuk keputusan final).

---

## 3. Modul & Struktur File (rencana)

### Client (app)

```
src/absen/
  AbsenFlow.js        orchestrator alur (state machine: idle → gps → detect → radius
                      → camera → confirm → submit → done / trapped)
  GeoRadius.js        haversine + titik kantor + radius config
  MockDetector.js     lapisan deteksi fake GPS (native + heuristik)
  CameraSelfie.js     wrapper kamera selfie + wajah + kompresi foto
  FraudReporter.js    kirim laporan curang + antrean offline
  LockedScreen.js     layar akun terkunci (wajib hubungi HR)
  config.js           koordinat kantor, radius, threshold deteksi
```

### Native (dev-build — Phase 2)

```
android/src/main/java/com/ggcwork/MockLocationModule.kt
  - isMockFromProvider()     LocationManager / provider "gps"|"network" vs emulator
  - isMockSettingEnabled()   Settings.Secure.ALLOW_MOCK_LOCATION (API<31)
  - readGpsAlmanac()         ketidakwajaran NMEA almanac/ephim (opsional, mendalam)
```

### Server (Laravel — Phase 3, butuh izin ubah backend)

```
routes/api.php            POST /api/absen, POST /api/absen/report-fraud
app/Http/Controllers/Api/AbsenController.php
app/Models/FraudReport.php
app/Models/AttendanceLog.php   (+ kolom latitude/longitude/photo_path/is_mock_flag)
app/Notifications/FakeGpsDetected.php   (email ke direktur/wadir/vp/hr/ikhsandwirana)
app/Jobs/UnlockAfterReview.php          (job: kunci akun, tunggu keputusan admin)
config/office.php        titik koordinat kantor + radius + penerima email
```

---

## 4. Deteksi Fake GPS (berlapis)

Keputusan: pakai **native mock-provider** sebagai lapis utama (perlu dev-build),
ditambah heuristik sebagai lapis cadangan. Semua lapisan digabung dengan skor.

### Lapis 1 — Native (kekuatan tertinggi, Android)

Dev-build (Expo prebuild / expo-dev-client) dengan modul Kotlin:

| Cek | Cara | API |
|---|---|---|
| `Location.isMock()` | flag `mocked` pada Location terakhir | API 31+ |
| `Location.isFromMockProvider()` | provider terdaftar sebagai mock | semua API |
| `Settings.Secure.ALLOW_MOCK_LOCATION == 1` | izin mock global ON | API ≤ 30 |
| `ProviderInfo` tidak konsisten | nama provider "gps" tapi berasal dari app mock | dalam |
| Emulator | `Build.FINGERPRINT` / `Build.PRODUCT` mengandung `generic`/`emulator` | semua |

Catatan:
- `ACCESS_MOCK_LOCATION` hanya bisa dipakai oleh app ber-signature level; karena kita
  tidak akan punya, kita pakai `isMock()` / `isFromMockProvider()` yang justru
  menandai lokasi dari provider mock **tanpa** butuh permission itu.
- Perlu **dev-build** (`expo run:android` / EAS Build). Tidak bisa jalan di Expo Go
  karena Expo Go tidak meng-host modul native kustom.

### Lapis 2 — Heuristik sensor + pola (jalan di Expo Go sebagai fallback)

- **Akselerometer** (expo-sensors): lokasi berubah drastis > 300 m dalam < 5 detik
  padahal akselerometer menunjukkan perangkat diam → mencurigakan.
- **Akurasi aneh**: accuracy = 0 persis berulang, atau accuracy > 1.000 m terus
  (provider palsu sering melapor akurasi tidak masuk akal).
- **Altitud aneh**: altitude NaN / tidak berubah sama sekali padahal bergerak.
- **Provider tidak wajar**: `mocked` dari library RN yang terbaca dari coords.
- **Emulator**: GPS dari emulator Android.
- **Pengulangan**: koordinat identik 100% untuk lokasi berbeda, atau drift tak wajar.

### Lapis 3 — Server (verifikasi silang)

- Server bandingkan koordinat yang dikirim dengan rentang IP/region jaringan.
- Catat `is_mock_flag` dari signature anti-tamper; jika signature rusak → anggap curang.

### Skor keputusan

```
Total skor = Σ bobot(lapis terpenuhi)
Skor >= THRESHOLD_TRAP  →  aktifkan JEBATAN (§5)
Skor >= THRESHOLD_WARN  →  minta ulang lokasi + catat peringatan
```

Konfigurasi di `config.js` client + `config/office.php` server, contoh:
`THRESHOLD_TRAP = 60` poin. Native `isMock()` = 100 (langsung trap). Heuristik masing-masing 25–40.

---

## 5. JEBATAN — saat fake GPS terdeteksi

Alur ketika skor >= THRESHOLD_TRAP:

```
FAKE GPS TERDETEKSI
   │
   ├─ 1. App langsung kunci layar: LockedScreen (tidak ada tombol keluar dari layar ini)
   ├─ 2. Hentikan polling/aktivitas lain, simpan state terkunci di AsyncStorage
   │       (@ggcwork/locked = {lockedAt, evidence, signature}) — supaya meski app
   │       ditutup, saat dibuka lagi tetap terkunci.
   ├─ 3. Kirim laporan ke server: POST /api/absen/report-fraud
   │       { employee_id, lat, lng, accuracy, timestamp, evidence[], device_info,
   │         app_version, screenshot/selfie_snapshot, anti_tamper_signature }
   │       └─ Jika offline → antre lokal, kirim saat koneksi pulih (retry loop).
   ├─ 4. Server verifikasi signature → simpan FraudReport → LOCK akun:
   │       users.is_locked = true, is_locked_at, lock_reason = 'fake_gps',
   │       lock_reference = <id laporan>
   ├─ 5. Kirim email ke: direktur, wakil_direktur, vp, hr,
   │       ikhsandwirana@gmail.com
   │       Subjek: [PENTING] Upaya Absen Fake GPS — <Nama> (<NIK>)
   │       Isi: nama, NIK, jabatan, divisi, timestamp, koordinat yang dilaporkan,
   │            bukti deteksi, versi app, tautan review admin.
   ├─ 6. App cek status akun (polling / saat buka): server balas is_locked=true
   │       → tetap tampil LockedScreen (bukan dari memory lokal, tapi otoritas server).
   └─ 7. Catat flag performansi: attendance_log.is_mock_flag = true
           → dipakai mesin skor performansi (lihat §6).
```

### LockedScreen (UX)

- Ikon gembok besar merah + teks besar: **"AKUN KAMU DIKUNCI"**
- Pesan permintaan maaf: "Kami mendeteksi upaya absen dengan lokasi palsu (fake GPS).
  Sesuai aturan, akunmu dikunci sementara. Segera hubungi HR untuk tindak lanjut.
  Mohon maaf karena telah bersikap tidak jujur — kejujuran adalah nilai utama kami."
- Tombol: **"Lapor ke HR via WhatsApp"** (buka wa.me nomor HR dengan pesan otomatis
  berisi employee_id + lock_reference) dan **"Buka Email"**.
- TIDAK ada tombol logout/masuk lain. Hanya admin server yang membuka kunci.

### Membuka kunci (sisi admin, Phase 3)

- HR/admin login dashboard → daftar FraudReport pending → review bukti → tombol
  "Buka Kunci" atau "Perkuat Kunci" (permanen).
- Aksi mencatat: `unlocked_by`, `unlocked_at`, `decision_note`.
- Bisa memicu email status ke karyawan setelah dibuka.

---

## 6. Integrasi Performansi

- Setiap `AttendanceLog` menyimpan `is_mock_flag` (true = absen curang).
- Mesin performansi bulanan menambahkan komponen penalti:
  `skor = skor - (jumlah_fraud × BOBOT_FRAUD)` (mis. −20 per kejadian, config).
- Laporan performa (PerformanceScreen) menampilkan badge peringatan bila karyawan
  punya catatan fraud bulan berjalan: "Peringatan: catatan absen tidak jujur".
- Riwayat fraud muncul di profil/performansi agar transparan dan adil.

---

## 7. Keamanan & Anti-Bypass

| Serangan | Penanganan |
|---|---|
| Reinstall app agar lolos kunci lokal | Kunci disimpan di **server** (users.is_locked). Login ditolak. |
| Matikan GPS, absen pakai koordinat palsu manual | Absen butuh fix GPS valid dari native; tanpa fix → absen ditolak. |
| Sembunyikan app mock dengan nama "gps" | Native `isMock()`/`isFromMockProvider()` menandai apa pun dari provider mock. |
| Root/Xposed memalsukan LocationManager | Lapis heuristik + server verification + human review bukti. |
| Replay request absen lama | Server cek `timestamp` fresh (< 2 menit) + `anti_tamper_signature`. |
| Ubah request HTTP langsung | `anti_tamper_signature` (HMAC rahasia app) di-verify server; jika gagal → fraud. |
| Replay foto selfie lama | Server simpan hash frame; deteksi foto duplikat antar absen. |

### Anti-tamper signature

```
signature = HMAC_SHA256(
   secret_app,                     // dibundel di app (obfuscated), rotasi berkala
   employee_id | lat | lng | accuracy | timestamp | is_mock_flag
)
```
Server simpan `secret_app` (bukan publik); verifikasi ulang setiap request absen.
Ini mencegah pemalsuan koordinat/flag pada level request HTTP biasa.

---

## 8. Data & Konfigurasi

### Titik kantor & radius (server = sumber kebenaran)

```
config/office.php
  'latitude'  => -7.057120,     // contoh koordinat kantor
  'longitude' => 110.441221,
  'radius'    => 100,           // meter
  'emails'    => ['direktur@ggclink.com','wakildirektur@ggclink.com',
                  'vp@ggclink.com','hr@ggclink.com','ikhsandwirana@gmail.com']
```

Client mengambil config ini dari endpoint (mis. dilampirkan di props `/dashboard`
atau endpoint `/api/absen/config`) — jangan hardcode di app agar mudah diubah.

### Tabel baru (server, Phase 3)

```
fraud_reports
  id, employee_id FK, lat, lng, accuracy, timestamp, evidence (json),
  device_info (json), app_version, anti_tamper_signature, status
  (pending|reviewed|dismissed), locked_at, unlocked_by, unlocked_at, decision_note

attendance_logs  (+ kolom) latitude, longitude, accuracy, photo_path, is_mock_flag

users  (+ kolom) is_locked, is_locked_at, lock_reason, lock_reference
```

---

## 9. Fase Implementasi (roadmap)

| Fase | Isi | Syarat |
|---|---|---|
| **0 (sekarang)** | Desain ini disetujui; siapkan modul client skeleton (opsional) | — |
| **1** | Absen fungsional dasar: GPS radius + selfie + submit, TANPA jebakan (uji coba). Native detection jalan lewat heuristik Expo-Go | izin backend endpoint absen |
| **2** | Dev-build + modul native mock-provider (lapis 1) | EAS/prebuild, keperluan APK |
| **3** | Jebakan penuh: report-fraud endpoint, lock akun, email ke direktur/wadir/vp/hr/ikhsandwirana, integrasi performansi | izin penuh ubah server |
| **4** | Dashboard admin review fraud + buka kunci | izin penuh ubah server |

Fase 3 & 4 membutuhkan persetujuan untuk mengubah server Laravel (`hrmggc_v3`),
termasuk menambah kolom, tabel, route, mailable, dan skor performansi.

---

## 10. Risiko & Catatan

- **Fake GPS yang benar-benar tak terdeteksi** (mis. perangkat jailbroken + native
  hook) tidak 100% bisa diblokir; jebakan ini menaikkan biaya kecurangan jauh lebih
  tinggi daripada manfaatnya, plus memberikan efek jera & audit trail.
- **False positive** (perangkat/area dengan GPS buruk): wajib ada mekanisme banding
  lewat HR, dan `THRESHOLD_WARN` untuk meminta ulang lokasi sebelum trap.
- Radius 100 m bisa dilonggarkan per kantor (multi-lokasi) — simpan daftar titik
  kantor di server, bukan satu titik.
- Izin lokasi di background tidak dibutuhkan; absen hanya di foreground. Hindari
  izin `ACCESS_FINE_LOCATION` ketat bila memungkinkan (tetap butuh untuk akurasi).
- Biaya email: gunakan Laravel queue + mailtrap untuk dev, SMTP perusahaan untuk prod.
