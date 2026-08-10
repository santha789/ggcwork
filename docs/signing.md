# Signing (Android / Play Store)

Dokumentasi konfigurasi penandatanganan aplikasi GGC Work.

## Upload Key — SHA-256 Certificate Fingerprint

Digunakan untuk "App signing" di Google Play Console.

```
1F:13:21:65:07:B3:D8:D0:6A:FB:EC:81:5E:37:41:55:2F:48:70:8F:B0:2E:CC:E6:F3:F8:E0:8A:90:04:35:23
```

- Sumber: keystore remote EAS (`Build Credentials`, default project `@santhakill/ggcwork`).
- Terdaftar di Play Console dan sudah terverifikasi.
- Semua build EAS (APK/AAB) memakai keystore yang sama, jadi fingerprint ini konsisten antar build.

## Cara Build & Upload

Build AAB production (versionCode auto-increment dari EAS):

```bash
EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli build -p android --profile production --non-interactive
```

(Note Termux: `eas-cli` perlu dijalankan via `node .../node_modules/eas-cli/bin/run` karena symlink `npx` tidak jalan.)

Cek status build:

```bash
npx eas-cli build:list -p android --limit 1
```

Upload AAB hasil build ke Play Console → Production (atau Internal testing untuk uji dulu).

## Catatan

- Jangan commit keystore/password ke repo.
- Jangan hilangkan keystore EAS — jika hilang, update app di Play Store tidak bisa (kecuali via Play App Signing).
- `app.json` `android.versionCode` di-ignore karena version source di remote; versi dikelola EAS.
