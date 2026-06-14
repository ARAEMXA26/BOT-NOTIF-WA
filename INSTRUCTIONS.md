# Panduan Setup WhatsApp Notification Bot

Dokumentasi ini menjelaskan langkah-langkah untuk menjalankan bot notifikasi WhatsApp, menghubungkannya ke akun WhatsApp Anda, melakukan *tunneling* port lokal, dan mengintegrasikannya dengan Google Forms menggunakan Google Apps Script.

---

## 1. Menjalankan Bot di Komputer Lokal

1. **Instal Dependensi**
   Buka terminal di folder project (`/Users/ariardianto/Documents/BEM/CODINGAN`) lalu jalankan:
   ```bash
   npm install
   ```

2. **Konfigurasi Environment**
   Buka file `.env` dan pastikan konfigurasi sudah benar:
   * `PORT=3000` (port server webhook lokal).
   * `TARGET_PHONE=6288293680886` (Nomor WhatsApp tujuan penerima notifikasi).
   * `WEBHOOK_TOKEN=kem_kominfo_secret_token_2026` (token keamanan untuk memvalidasi request dari Google).

3. **Jalankan Bot**
   Jalankan perintah berikut untuk memulai server dan koneksi WhatsApp:
   ```bash
   npm start
   ```

4. **Scan QR Code**
   Saat pertama kali dijalankan, sebuah QR Code akan muncul di terminal.
   * Buka WhatsApp di HP Anda.
   * Masuk ke **Setelan > Perangkat Tertaut > Tautkan Perangkat** (Settings > Linked Devices > Link a Device).
   * Scan QR Code yang ada di terminal.
   * Setelah sukses tersambung, bot akan menyimpan session di folder `auth_info_baileys` secara lokal sehingga Anda tidak perlu men-scan QR code lagi saat bot di-restart.

---

## 2. Melakukan Tunneling Port Lokal (Expose ke Internet)

Agar server Google Forms (Google Apps Script) dapat mengirim data ke bot yang berjalan di laptop lokal Anda, port `3000` harus bisa diakses dari internet. Anda bisa menggunakan **localtunnel** atau **ngrok**.

### Opsi A: Menggunakan Localtunnel (Sangat Mudah & Tanpa Akun)
Buka jendela terminal baru (di folder mana saja) dan jalankan:
```bash
npx localtunnel --port 3000
```
Terminal akan menampilkan URL publik seperti:
`https://glowing-words-look.loca.lt`
Maka URL Webhook Anda adalah: `https://glowing-words-look.loca.lt/webhook`

### Opsi B: Menggunakan Ngrok (Lebih Stabil, Perlu Akun Free)
1. Unduh dan instal [ngrok](https://ngrok.com/).
2. Jalankan perintah di terminal:
   ```bash
   ngrok http 3000
   ```
3. Salin URL Forwarding HTTPS yang diberikan (misalnya: `https://xxxx-xx.ngrok-free.app`).
   Maka URL Webhook Anda adalah: `https://xxxx-xx.ngrok-free.app/webhook`

---

## 3. Menghubungkan Google Forms (Google Apps Script)

Ikuti langkah berikut untuk mengonfigurasi Google Form agar otomatis mengirim data ke bot setiap kali ada pengisian baru:

1. Buka Google Form Anda di browser: `https://docs.google.com/forms/d/1XNzO2mrIe2SdKZtjQ4_Ma8eOl1Rx8qEy_NnEhBXajdY/edit`
2. Di pojok kanan atas, klik tombol tiga titik vertical (Menu Lainnya/More) lalu pilih **Editor Skrip** (Script Editor).
3. Hapus semua kode default di editor, lalu paste kode berikut:

```javascript
// Konfigurasi Webhook
var WEBHOOK_URL = "ISI_DENGAN_URL_WEBHOOK_TUNNEL_ANDA/webhook";
var WEBHOOK_TOKEN = "bem_kominfo_secret_token_2026"; // Harus sama dengan WEBHOOK_TOKEN di file .env

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
  
  // Opsi request HTTP POST dengan bypass header localtunnel
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Bypass-Tunnel-Reminder": "true"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  // Kirim data ke bot
  try {
    var httpResponse = UrlFetchApp.fetch(WEBHOOK_URL, options);
    Logger.log("Response Code: " + httpResponse.getResponseCode());
    Logger.log("Response Body: " + httpResponse.getContentText());
  } catch (error) {
    Logger.log("Error sending webhook: " + error.toString());
  }
}
```

4. Ganti `WEBHOOK_URL` di bagian atas script dengan URL webhook tunnel Anda (jangan lupa akhiran `/webhook`). Contoh: `https://glowing-words-look.loca.lt/webhook` atau `https://xxxx.ngrok-free.app/webhook`.
5. Klik ikon **Simpan** (Floppy disk/Save project) di atas editor.
6. **PENTING (Set Trigger):**
   * Di panel menu sebelah kiri, klik ikon jam (Triggers / Pemicu).
   * Klik tombol **+ Tambahkan Pemicu** (+ Add Trigger) di kanan bawah.
   * Atur opsi konfigurasi pemicu berikut:
     * Pilih fungsi yang ingin dijalankan: `onFormSubmit`
     * Pilih penerapan yang ingin dijalankan: `Head`
     * Pilih sumber acara: `Dari formulir` (From form)
     * Pilih jenis acara: `Saat mengirim formulir` (On form submit)
     * Setelan notifikasi kegagalan: `Beritahu saya segera` (Notify me immediately)
   * Klik **Simpan** (Save).
   * Google akan meminta otorisasi akun untuk mengakses form dan melakukan request eksternal. Klik akun Google Anda, pilih **Advanced (Lanjutan) > Go to Untitled Project (unsafe)**, lalu klik **Allow (Izinkan)**.

Selesai! Sekarang, setiap kali seseorang mengirim jawaban di Google Form, bot akan langsung mengirim notifikasi berformat rapi ke WhatsApp tujuan dan mengupdate statistik secara real-time di `db.json`.
