# Quick Start - Lokaler Test

Schnellanleitung für den ersten lokalen Test in 5 Minuten.

## 🚀 Start in 5 Schritten

### 1️⃣ Dependencies installieren

```bash
npm install
```

### 2️⃣ Environment konfigurieren

```bash
cp .env.example .env
```

**Editieren Sie `.env` und tragen Sie ein:**
```env
OPENAI_API_KEY=sk-proj-IHRE-ECHTE-KEY-HIER
```

### 3️⃣ Server starten

```bash
npm run dev
```

**✅ Erfolgreich wenn Sie sehen:**
```
✅ IVU Voice API Server started
📡 HTTP Server: http://localhost:3001
🔌 WebSocket Server: ws://localhost:3001
```

### 4️⃣ ngrok starten (neues Terminal)

```bash
ngrok http 3001
```

**Notieren Sie die URL, z.B.:**
```
https://abc123.ngrok-free.app
```

### 5️⃣ TENIOS konfigurieren

1. Öffnen Sie TENIOS-Dashboard
2. Ihre Test-Rufnummer → Routing → Call Control API
3. Webhook-URL: `https://abc123.ngrok-free.app/api/webhook`
4. Speichern

## 🧪 Test durchführen

### Terminal 3: Test-Client starten

```bash
cd ../workshop
npx tsx test-client.ts
```

**Vorher:** Öffnen Sie `workshop/test-client.ts` und ändern Sie Zeile 30:
```typescript
const phoneNumber = '+4930XXXXXXXX'; // <-- Ihre TENIOS-Nummer
```

### Anrufen

Rufen Sie Ihre TENIOS-Nummer an.

**✅ Erfolgreich wenn:**
- Sie hören: "Hallo! Willkommen beim IVU Voice API Test..."
- Server-Terminal zeigt Webhook-Logs
- Client-Terminal zeigt "INCOMING CALL!"

## 🎉 Fertig!

Wenn der Test funktioniert:
- ✅ Server läuft
- ✅ WebSocket funktioniert
- ✅ TENIOS Webhook kommt an
- ✅ Call-Routing funktioniert
- ✅ Text-to-Speech funktioniert

**Nächste Schritte:**
- Siehe `LOCAL-TESTING.md` für erweiterte Tests
- Beispiele 01-04 testen
- Danach: Deployment auf Hetzner

## 🐛 Probleme?

**Server startet nicht:**
```bash
# Port belegt?
lsof -i :3001
kill -9 <PID>
```

**Keine Webhooks:**
```bash
# ngrok Web UI öffnen
open http://127.0.0.1:4040

# Sehen Sie dort Requests von TENIOS?
```

**Vollständiger Troubleshooting-Guide:**
Siehe `LOCAL-TESTING.md` Abschnitt "Troubleshooting"
