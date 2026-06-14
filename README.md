# 🤖 BEM Kominfo WhatsApp Notification Bot

Bot notifikasi WhatsApp otomatis untuk mengintegrasikan Google Forms dengan WhatsApp Group. Setiap kali ada pengisian baru di Google Form, bot akan mengirimkan pesan notifikasi dengan format rapi dan estetik ke grup WhatsApp tujuan, serta memperbarui statistik pengisian secara real-time.

Proyek ini menggunakan library **Baileys** untuk koneksi WhatsApp (WebSocket) dan **Express** sebagai server penerima webhook.

---

## ✨ Fitur Utama

- **Web Dashboard & QR Page**: Memudahkan proses linking WhatsApp via browser `/qr` (sangat berguna saat deploy di cloud/PaaS seperti Railway).
- **Format Pesan Premium & Estetik**: Tampilan rapi menggunakan border box, pembatas visual, emoji yang terorganisasi, dan alignment yang presisi.
- **Statistik Real-time**: Menyimpan jumlah submit per kementerian di `db.json` dan menampilkannya di akhir pesan notifikasi (hanya menampilkan kementerian yang aktif/memiliki submission > 0, terurut dari jumlah terbanyak).
- **Pembersihan Konten Otomatis**: Secara cerdas menyembunyikan informasi yang opsional atau bernilai kosong (seperti Referensi: "Tidak ada") agar pesan tetap ringkas.
- **Keamanan Webhook**: Dilengkapi dengan token verifikasi (`WEBHOOK_TOKEN`) untuk memastikan request hanya diterima dari Google Apps Script resmi Anda.
- **Auto-restart & Kestabilan**: Terkonfigurasi untuk otomatis menghubungkan kembali session WhatsApp jika terjadi kendala jaringan atau server di-restart.

---

## 📁 Struktur File Proyek

```bash
├── bot.js              # Logika utama Express server & koneksi WhatsApp (Baileys)
├── db.json             # Database lokal (JSON) untuk pencatatan statistik submission
├── package.json        # Manifest project Node.js & daftar dependensi
├── railway.json        # Konfigurasi deployment untuk platform Railway.app
├── Procfile            # Perintah start untuk platform cloud
├── .gitignore          # File untuk mengecualikan auth_info_baileys, .env, & db.json dari Git
├── .env                # File konfigurasi lokal (Sensitif / Rahasia)
├── INSTRUCTIONS.md     # Panduan cepat setup lokal
└── test-webhook.js     # Script pembantu untuk mensimulasikan submit form secara lokal
```

---

## 🛠️ Cara Setup & Menjalankan di Lokal

### 1. Prasyarat
Pastikan komputer Anda sudah terinstal **Node.js (versi minimal v18.x)**.

### 2. Instalasi Dependensi
Buka terminal di direktori proyek ini, kemudian jalankan:
```bash
npm install
```

### 3. Konfigurasi Environment (`.env`)
Buat atau edit file bernama `.env` di root folder proyek Anda:
```env
PORT=3000
TARGET_PHONE=6288293680886
TARGET_GROUP_NAME=Kementerian Komunikasi dan Informasi
WEBHOOK_TOKEN=bem_kominfo_secret_token_2026
```
> **Catatan**:
> - `TARGET_PHONE`: Nomor bot WhatsApp yang menghubungkan ke grup.
> - `TARGET_GROUP_NAME`: Nama persis grup WhatsApp tempat notifikasi akan dikirimkan.
> - `WEBHOOK_TOKEN`: Token rahasia yang harus sama dengan yang diatur di Google Apps Script.

### 4. Jalankan Bot
Untuk memulai server Express dan koneksi WhatsApp, jalankan:
```bash
npm start
```

### 5. Hubungkan ke WhatsApp
Saat bot pertama kali berjalan:
1. Terminal akan menampilkan QR Code.
2. Anda juga bisa membuka browser ke `http://localhost:3000/qr` untuk melihat QR Code versi Web.
3. Di HP Anda: Buka **WhatsApp > Menu (Titik Tiga) / Setelan > Perangkat Tertaut > Tautkan Perangkat**, lalu scan QR tersebut.
4. Setelah berhasil terhubung, session akan disimpan otomatis di folder `auth_info_baileys/`. Anda tidak perlu scan QR lagi saat me-restart bot.

---

## 🌐 Menghubungkan Google Form ke Bot Lokal (Tunneling)

Agar Google Form di internet bisa berkomunikasi dengan bot yang berjalan di laptop lokal Anda, gunakan aplikasi tunneling seperti **Localtunnel** atau **Ngrok**:

### Opsi A: Localtunnel (Praktis, Tanpa Daftar)
Jalankan perintah ini di jendela terminal baru:
```bash
npx localtunnel --port 3000
```
Salin URL publik yang muncul (misal: `https://glowing-words-look.loca.lt`). URL webhook Anda adalah:
`https://glowing-words-look.loca.lt/webhook`

### Opsi B: Ngrok (Lebih Stabil)
Jalankan perintah:
```bash
ngrok http 3000
```
Salin URL forwarding HTTPS yang dibuat oleh ngrok (misal: `https://xxxx.ngrok-free.app`). URL webhook Anda adalah:
`https://xxxx.ngrok-free.app/webhook`

---

## 📝 Integrasi Google Forms (Google Apps Script)

Berikut cara mengonfigurasi Google Forms Anda:

1. Buka Google Form Anda di browser.
2. Klik tombol menu tiga titik vertikal di pojok kanan atas, lalu pilih **Editor Skrip** (Script Editor).
3. Hapus semua kode default, lalu salin dan tempel kode JavaScript berikut:

```javascript
// Konfigurasi Webhook
var WEBHOOK_URL = "ISI_DENGAN_URL_WEBHOOK_TUNNEL_ATAU_CLOUD_ANDA/webhook";
var WEBHOOK_TOKEN = "bem_kominfo_secret_token_2026"; // Harus sama dengan WEBHOOK_TOKEN di bot

function onFormSubmit(e) {
  var payload = {
    token: WEBHOOK_TOKEN
  };
  
  // 1. Deteksi jika trigger berasal dari Spreadsheet
  if (e.namedValues) {
    for (var key in e.namedValues) {
      if (e.namedValues.hasOwnProperty(key)) {
        var value = e.namedValues[key];
        var valStr = Array.isArray(value) ? value[0] : value;
        
        // Normalisasi key email & timestamp agar sama dengan format bot
        if (key.toLowerCase() === 'email address' || key.toLowerCase() === 'alamat email' || key.toLowerCase() === 'email') {
          payload['email'] = valStr;
        } else if (key.toLowerCase() === 'timestamp' || key.toLowerCase() === 'stempel waktu') {
          payload['timestamp'] = valStr;
        } else {
          payload[key] = valStr;
        }
      }
    }
  } 
  // 2. Deteksi jika trigger berasal dari Google Form langsung
  else if (e.response) {
    var response = e.response;
    var itemResponses = response.getItemResponses();
    
    payload['email'] = response.getRespondentEmail() || "Tidak ada email (Form tidak mengumpulkan email)";
    payload['timestamp'] = response.getTimestamp() ? response.getTimestamp().toLocaleString('id-ID') : new Date().toLocaleString('id-ID');
    
    for (var i = 0; i < itemResponses.length; i++) {
      var itemResponse = itemResponses[i];
      var title = itemResponse.getItem().getTitle();
      var value = itemResponse.getResponse();
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
      payload[title] = value;
    }
  }
  
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Bypass-Tunnel-Reminder": "true"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var httpResponse = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log("Response Code: " + httpResponse.getResponseCode());
  } catch (error) {
    Logger.log("Error sending webhook: " + error.toString());
  }
}
```

4. Ubah variabel `WEBHOOK_URL` di bagian atas kode sesuai URL webhook Anda (lokal tunnel atau cloud URL).
5. Klik **Simpan** (ikon disket).
6. **Set Trigger (Pemicu)**:
   - Pilih menu **Pemicu (Triggers)** di sidebar sebelah kiri (ikon jam).
   - Klik **+ Tambahkan Pemicu** (+ Add Trigger) di kanan bawah.
   - Atur:
     - Fungsi: `onFormSubmit`
     - Sumber Acara: `Dari formulir`
     - Jenis Acara: `Saat mengirim formulir`
   - Klik **Simpan**. Otorisasi akun Google Anda jika diminta (pilih Lanjutan / Advanced -> Buka Project -> Izinkan / Allow).

---

## 🚀 Panduan Deploy ke Railway.app (Free Cloud Hosting)

Karena bot membutuhkan koneksi WebSocket yang *always-on*, **Railway.app** adalah solusi terbaik yang menyediakan free credits/free tier bulanan.

### Langkah-langkah Deployment:
1. Buat repository baru di GitHub (misal: `BOT-NOTIF-WA`) secara **Private**.
2. Push seluruh file project Anda ke repository tersebut:
   ```bash
   git remote add origin https://github.com/USERNAME_ANDA/BOT-NOTIF-WA.git
   git push -u origin main --force
   ```
3. Buka **[railway.app](https://railway.app)** dan masuk dengan akun GitHub Anda.
4. Klik **New Project** > **Deploy from GitHub repo** > pilih `BOT-NOTIF-WA`.
5. Buka tab **Variables** di Railway Dashboard proyek Anda dan tambahkan variables berikut:
   - `PORT` = `3000`
   - `WEBHOOK_TOKEN` = `bem_kominfo_secret_token_2026`
   - `TARGET_PHONE` = `6288293680886`
   - `TARGET_GROUP_NAME` = `Kementerian Komunikasi dan Informasi`
6. Buka URL domain publik yang diberikan oleh Railway (contoh: `https://xxxx.up.railway.app`).
7. Masuk ke menu **Scan QR Code** (atau buka path `/qr`).
8. Pindai/Scan QR code menggunakan WhatsApp di HP Anda.
9. Setelah status berubah menjadi **🟢 Connected**, perbarui nilai `WEBHOOK_URL` di Google Apps Script Anda menggunakan URL Railway (misal: `https://xxxx.up.railway.app/webhook`).

---

## 📈 Endpoint API Bot

| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/` | Dashboard pemantauan status bot WhatsApp |
| `GET` | `/qr` | Halaman scan QR code WhatsApp berbasis web |
| `GET` | `/health` | Pemeriksaan kesehatan aplikasi (healthcheck) |
| `POST` | `/webhook` | Handler webhook untuk memproses submission Google Form |

---

## ⚙️ Cara Menguji Secara Lokal

Anda bisa menggunakan command berikut di terminal untuk mensimulasikan kirim webhook:
```bash
npm run test
```
Script tersebut akan mengirimkan request dummy ke `http://localhost:3000/webhook` dengan data tiruan Google Form. Cek apakah WhatsApp bot Anda mengirim pesan ke grup target!
