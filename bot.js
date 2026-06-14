require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Constants & Config
const PORT = process.env.PORT || 3000;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'bem_kominfo_secret_token_2026';
const TARGET_PHONE = process.env.TARGET_PHONE || '6288293680886';
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize Logger
const logger = pino({ level: 'info' });

// Global WhatsApp Client reference
let sock = null;
let isConnected = false;
let latestQR = null; // Store latest QR for web display

// Statistics helper functions
function readStats() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Error reading stats file: ' + error.message);
  }
  
  return {
    totalSubmissions: 0,
    kementrianStats: {
      "PSDM": 0,
      "DAGRI": 0,
      "KEMENLU": 0,
      "SENBORA": 0,
      "BPH": 0,
      "KASTRAT": 0,
      "Lainnya": 0
    }
  };
}

function updateStats(kementrianInput) {
  const stats = readStats();
  
  let normalizedKementrian = 'Lainnya';
  if (kementrianInput) {
    const kementrianClean = kementrianInput.trim().toUpperCase();
    const validKementrian = ['PSDM', 'DAGRI', 'KEMENLU', 'SENBORA', 'BPH', 'KASTRAT'];
    
    const matched = validKementrian.find(k => k === kementrianClean || kementrianClean.includes(k));
    if (matched) {
      normalizedKementrian = matched;
    }
  }
  
  stats.totalSubmissions += 1;
  if (!stats.kementrianStats[normalizedKementrian]) {
    stats.kementrianStats[normalizedKementrian] = 0;
  }
  stats.kementrianStats[normalizedKementrian] += 1;
  
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(stats, null, 2), 'utf8');
  } catch (error) {
    logger.error('Error writing stats file: ' + error.message);
  }
  
  return stats;
}

// WhatsApp Connection Handler
async function connectToWhatsApp() {
  logger.info('Initializing WhatsApp connection...');
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));
  
  let version = [2, 3000, 1015901307];
  try {
    const { fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
    const latest = await fetchLatestBaileysVersion();
    if (latest && latest.version) {
      version = latest.version;
      logger.info(`Using WhatsApp Web version: ${version.join('.')}`);
    }
  } catch (err) {
    logger.warn('Failed to fetch latest WhatsApp Web version, using fallback: ' + err.message);
  }
  
  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      latestQR = qr; // Store for web display
      logger.info('QR Code updated. Scan via /qr endpoint or terminal below:');
      qrcodeTerminal.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      isConnected = false;
      latestQR = null;
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.error(`WhatsApp connection closed. Status: ${statusCode}`);
      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(), 3000); // Delay reconnect
      } else {
        logger.error('Session logged out. Delete auth_info_baileys and restart.');
      }
    } else if (connection === 'open') {
      isConnected = true;
      latestQR = null; // Clear QR once connected
      logger.info('WhatsApp Client successfully connected!');
    }
  });
}

// ─── Express Server ────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check (for Railway / hosting platforms) ────────
app.get('/', (req, res) => {
  const stats = readStats();
  const status = isConnected ? '🟢 Connected' : latestQR ? '🟡 Waiting for QR Scan' : '🔴 Disconnected';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BEM Kominfo WA Bot</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0f0f; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; max-width: 420px; width: 90%; text-align: center; }
        h1 { font-size: 1.2rem; color: #fff; margin-bottom: 4px; }
        .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
        .status { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 0.9rem; font-weight: 600; margin-bottom: 20px; }
        .status.connected { background: #0a2e1a; color: #4ade80; border: 1px solid #166534; }
        .status.waiting { background: #2e2a0a; color: #facc15; border: 1px solid #854d0e; }
        .status.offline { background: #2e0a0a; color: #f87171; border: 1px solid #991b1b; }
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .stat-box { background: #222; border-radius: 10px; padding: 14px; }
        .stat-box .num { font-size: 1.5rem; font-weight: 700; color: #fff; }
        .stat-box .label { font-size: 0.75rem; color: #888; margin-top: 2px; }
        .qr-link { display: inline-block; margin-top: 16px; color: #60a5fa; text-decoration: none; font-size: 0.85rem; }
        .qr-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📢 BEM Kominfo WA Bot</h1>
        <p class="subtitle">Notification Bot Status</p>
        <div class="status ${isConnected ? 'connected' : latestQR ? 'waiting' : 'offline'}">${status}</div>
        <div class="stats">
          <div class="stat-box">
            <div class="num">${stats.totalSubmissions}</div>
            <div class="label">Total Request</div>
          </div>
          <div class="stat-box">
            <div class="num">${Object.values(stats.kementrianStats).filter(v => v > 0).length}</div>
            <div class="label">Kementrian Aktif</div>
          </div>
        </div>
        ${latestQR ? '<a class="qr-link" href="/qr">🔗 Scan QR Code →</a>' : ''}
      </div>
    </body>
    </html>
  `);
});

// ─── QR Code Web Endpoint (for cloud deployment) ──────────
app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send(`
      <html><body style="background:#0f0f0f;color:#4ade80;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
        <div style="text-align:center">
          <h2>✅ WhatsApp Sudah Terhubung!</h2>
          <p style="color:#888;margin-top:8px">Tidak perlu scan QR code lagi.</p>
          <a href="/" style="color:#60a5fa;margin-top:16px;display:inline-block">← Kembali</a>
        </div>
      </body></html>
    `);
  }
  
  if (!latestQR) {
    return res.send(`
      <html><body style="background:#0f0f0f;color:#facc15;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
        <div style="text-align:center">
          <h2>⏳ Menunggu QR Code...</h2>
          <p style="color:#888;margin-top:8px">QR code belum tersedia. Halaman akan auto-refresh.</p>
          <a href="/" style="color:#60a5fa;margin-top:16px;display:inline-block">← Kembali</a>
        </div>
      </body></html>
    `);
  }
  
  try {
    const qrDataUrl = await QRCode.toDataURL(latestQR, { width: 300, margin: 2 });
    res.send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="30">
        <title>Scan QR - BEM Kominfo Bot</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0f0f; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; text-align: center; }
          h2 { margin-bottom: 8px; color: #fff; }
          .hint { color: #888; font-size: 0.85rem; margin-bottom: 20px; }
          img { border-radius: 12px; background: #fff; padding: 8px; }
          .steps { text-align: left; margin-top: 20px; color: #aaa; font-size: 0.8rem; line-height: 1.8; }
          .steps b { color: #e0e0e0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📱 Scan QR Code</h2>
          <p class="hint">Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>
          <img src="${qrDataUrl}" alt="QR Code" />
          <div class="steps">
            <b>Langkah:</b><br>
            1. Buka WhatsApp di HP<br>
            2. Ketuk <b>⋮ Menu</b> → <b>Perangkat Tertaut</b><br>
            3. Ketuk <b>Tautkan Perangkat</b><br>
            4. Scan QR di atas<br>
            <br>
            <em>Halaman auto-refresh tiap 30 detik.</em>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error generating QR: ' + err.message);
  }
});

// ─── Health Endpoint (for uptime monitoring) ───────────────
app.get('/health', (req, res) => {
  res.json({
    status: isConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ─── Webhook Receiver Endpoint ─────────────────────────────
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  logger.info(`Received webhook payload from Google Form.`);
  
  // 1. Verify Token
  const tokenHeader = req.headers['x-webhook-token'];
  const tokenQuery = req.query.token;
  const tokenBody = payload.token;
  const clientToken = tokenHeader || tokenQuery || tokenBody;
  
  if (clientToken !== WEBHOOK_TOKEN) {
    logger.warn('Unauthorized webhook request: invalid or missing token.');
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
  
  // 2. Extract System Fields
  let timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  for (const key of Object.keys(payload)) {
    if (key.toLowerCase() === 'timestamp' || key.toLowerCase() === 'stempel waktu' || key.toLowerCase() === 'waktu') {
      timestamp = payload[key];
      break;
    }
  }
  
  let kementrianKey = null;
  let kementrianVal = 'Lainnya';
  for (const key of Object.keys(payload)) {
    if (key.toLowerCase().includes('kementrian') || key.toLowerCase().includes('kementerian')) {
      kementrianKey = key;
      kementrianVal = payload[key];
      break;
    }
  }
  
  // 3. Update Statistics
  const updatedStats = updateStats(kementrianVal);
  
  // 4. Extract form fields in the EXACT order of the Google Form
  const findField = (keywords) => {
    for (const key of Object.keys(payload)) {
      const lk = key.toLowerCase();
      if (keywords.some(kw => lk.includes(kw))) {
        return { key, value: payload[key] };
      }
    }
    return null;
  };
  
  const templateCaption = findField(['template caption']);
  const jenisPermintaan = findField(['jenis permintaan']);
  const judulKonten = findField(['judul konten', 'judul']);
  const briefKonten = findField(['brief', 'isi konten']);
  const referensi = findField(['referensi']);
  const deadline = findField(['deadline']);
  const platformTujuan = findField(['platform tujuan', 'platform']);
  
  // Build "Rincian Konten" section
  const fields = [];
  
  if (jenisPermintaan && jenisPermintaan.value) {
    fields.push({ label: 'Jenis Permintaan', value: jenisPermintaan.value.trim() });
  }
  if (judulKonten && judulKonten.value) {
    fields.push({ label: 'Judul Konten', value: judulKonten.value.trim() });
  }
  if (briefKonten && briefKonten.value) {
    fields.push({ label: 'Brief / Isi Konten', value: briefKonten.value.trim() });
  }
  if (templateCaption && templateCaption.value && templateCaption.value.trim()) {
    fields.push({ label: 'Template Caption', value: templateCaption.value.trim() });
  }
  if (referensi && referensi.value && referensi.value.trim() && referensi.value.trim().toLowerCase() !== 'tidak ada') {
    fields.push({ label: 'Referensi', value: referensi.value.trim() });
  }
  if (deadline && deadline.value) {
    fields.push({ label: 'Deadline', value: deadline.value.trim() });
  }
  if (platformTujuan && platformTujuan.value) {
    fields.push({ label: 'Platform Tujuan', value: platformTujuan.value.trim() });
  }
  
  let rincianText = fields.map(f => `▸ *${f.label}*\n   ${f.value}`).join('\n\n');
  if (!rincianText) {
    rincianText = '_Tidak ada rincian konten._';
  }
  
  // 5. Build stats
  const activeKementrian = Object.entries(updatedStats.kementrianStats)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  
  const kementrianBreakdown = activeKementrian
    .map(([kem, count]) => `   ${kem}: *${count}*`)
    .join('\n');
  
  // 6. Format WhatsApp Message
  const waMessage = `╔══════════════════════╗
   📢  *REQUEST KONTEN MASUK*
╚══════════════════════╝

▸ *Dari:* ${kementrianVal.trim().toUpperCase()}
▸ *Waktu:* ${timestamp}

── *Rincian Konten* ──────

${rincianText}

── *Statistik* ───────────

📊 Total Request: *${updatedStats.totalSubmissions}*

${kementrianBreakdown}

─────────────────────
_BEM Kominfo Notification Bot_`;
  
  // 7. Send WhatsApp Message
  if (!isConnected) {
    logger.error('Cannot send WhatsApp notification: Client is not connected.');
    return res.status(503).json({ 
      success: false, 
      error: 'WhatsApp client is offline. Stats updated, but message not sent.' 
    });
  }
  
  try {
    let targetJid = null;
    const targetGroupName = process.env.TARGET_GROUP_NAME;
    
    if (targetGroupName && targetGroupName.trim() !== '') {
      const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ');
      const searchName = normalize(targetGroupName);
      
      const stats = readStats();
      if (stats.groupJidCache && stats.groupNameCache === targetGroupName) {
        targetJid = stats.groupJidCache;
        logger.info(`Using cached Group JID: ${targetJid} for group: "${targetGroupName}"`);
      } else {
        if (stats.groupJidCache && stats.groupNameCache !== targetGroupName) {
          logger.info(`Group name changed, clearing cache.`);
          delete stats.groupJidCache;
          delete stats.groupNameCache;
        }
        
        logger.info(`Searching for WhatsApp group matching: "${targetGroupName}"...`);
        const groups = await sock.groupFetchAllParticipating();
        
        let exactMatch = null;
        let partialMatch = null;
        
        for (const [jid, metadata] of Object.entries(groups)) {
          const subject = normalize(metadata.subject);
          
          if (subject === searchName) {
            exactMatch = { jid, name: metadata.subject };
            break;
          }
          
          if (!partialMatch && (subject.includes(searchName) || searchName.includes(subject))) {
            partialMatch = { jid, name: metadata.subject };
          }
        }
        
        const match = exactMatch || partialMatch;
        
        if (match) {
          targetJid = match.jid;
          logger.info(`Found group: "${match.name}" -> JID: ${match.jid}`);
          stats.groupJidCache = match.jid;
          stats.groupNameCache = targetGroupName;
          try {
            fs.writeFileSync(DB_FILE, JSON.stringify(stats, null, 2), 'utf8');
          } catch (e) {}
        } else {
          logger.warn(`Group "${targetGroupName}" not found.`);
        }
      }
    }
    
    if (!targetJid) {
      targetJid = `${TARGET_PHONE.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      logger.info(`Sending to direct contact: ${TARGET_PHONE}`);
    } else {
      logger.info(`Sending to group: ${targetJid}`);
    }
    
    await sock.sendMessage(targetJid, { text: waMessage });
    logger.info(`Successfully sent notification to: ${targetJid}`);
    return res.status(200).json({ success: true, message: 'Notification sent successfully' });
  } catch (err) {
    logger.error(`Failed to send WhatsApp message: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Failed to send WhatsApp message' });
  }
});

// ─── Start Application ─────────────────────────────────────
async function startApp() {
  // Start Express first so health checks work during WA connection
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Dashboard: http://localhost:${PORT}`);
    logger.info(`QR Code:   http://localhost:${PORT}/qr`);
    logger.info(`Webhook:   http://localhost:${PORT}/webhook`);
  });
  
  await connectToWhatsApp();
}

startApp().catch(err => {
  logger.error('Failed to start application:', err);
});
