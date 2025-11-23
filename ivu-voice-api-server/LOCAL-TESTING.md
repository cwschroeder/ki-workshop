# Lokaler Test-Guide

Anleitung zum lokalen Testen des IVU Voice API Servers mit ngrok.

## 🎯 Test-Setup Übersicht

```
Workshop-Client (lokal)
    ↓ WebSocket (localhost:3001)
IVU Voice API Server (lokal)
    ↓ Webhook (ngrok → localhost:3001)
TENIOS
    ↓ Telefonie
Test-Anrufer
```

## ✅ Schritt 1: Dependencies installieren

```bash
cd ivu-voice-api-server
npm install
```

## ✅ Schritt 2: Environment konfigurieren

```bash
cp .env.example .env
```

Editieren Sie `.env`:

```env
# TENIOS
TENIOS_API_KEY=9fd94019-4bb8-461e-9dbb-029701db5f5a

# AI Provider
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-your-actual-key-here

# Server
PORT=3001
NODE_ENV=development

# Workshop
WORKSHOP_DATA_DIR=../workshop/workshop-data
ENABLE_CORS=true
LOG_LEVEL=debug
```

## ✅ Schritt 3: Server starten

```bash
npm run dev
```

**Erwartete Ausgabe:**
```
🚀 Initializing IVU Voice API Server...

✅ Environment configuration loaded:
   - AI Provider: openai
   - Server Port: 3001
   - WebSocket Port: 3001
   - Node Environment: development
   - Workshop Data: ../workshop/workshop-data

[ProviderFactory] Creating AI provider: openai
[ProviderFactory] Creating Telephony provider: TENIOS

✅ Providers initialized:
   - AI: OpenAI
   - Telephony: TENIOS

✅ IVU Voice API Server started

📡 HTTP Server: http://localhost:3001
🔌 WebSocket Server: ws://localhost:3001
📝 Environment: development
📁 Workshop Data: ../workshop/workshop-data

📋 Endpoints:
   GET  /health              - Health check
   POST /api/webhook         - TENIOS webhook
   GET  /api/sessions        - List sessions
   POST /api/sessions/cleanup - Cleanup inactive

🎯 Ready for workshop! Connect clients to ws://localhost:3001
```

## ✅ Schritt 4: Health Check

In einem neuen Terminal:

```bash
curl http://localhost:3001/health | jq
```

**Erwartete Antwort:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-23T10:00:00.000Z",
  "totalSessions": 0,
  "activeCalls": 0,
  "assignedPhones": 0,
  "providers": {
    "ai": "OpenAI",
    "telephony": "TENIOS"
  }
}
```

## ✅ Schritt 5: ngrok starten

In einem neuen Terminal:

```bash
ngrok http 3001
```

**Wichtig:** Notieren Sie die ngrok-URL, z.B.:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3001
```

## ✅ Schritt 6: TENIOS Webhook konfigurieren

1. Gehen Sie zum TENIOS-Dashboard
2. Wählen Sie Ihre Test-Rufnummer
3. Konfigurieren Sie Routing → Call Control API
4. Webhook-URL eintragen:
   ```
   https://abc123.ngrok-free.app/api/webhook
   ```

## ✅ Schritt 7: Test-Client vorbereiten

### Option A: Einfacher Test-Client

Erstellen Sie `test-client.ts` im Workshop-Verzeichnis:

```typescript
import { createVoiceSession } from './lib/ivu-voice-client';

async function test() {
  console.log('🧪 Testing IVU Voice API...\n');

  // Verbindung zu lokalem Server
  const session = await createVoiceSession({
    serverUrl: 'ws://localhost:3001'
  });

  console.log('✅ Connected to server\n');

  // Rufnummer zuweisen (Ihre TENIOS-Nummer)
  await session.assignPhoneNumber('+4930XXXXXXXX'); // <-- Ihre Nummer eintragen

  console.log('✅ Phone number assigned\n');
  console.log('📞 Waiting for calls...\n');
  console.log('💡 Call your number now!\n');

  // Call-Handler
  session.on('call.incoming', async (call) => {
    console.log('📞 CALL INCOMING!');
    console.log('   Call ID:', call.callId);

    try {
      await call.say('Hallo! Dies ist ein Test des IVU Voice API Servers.');
      await call.say('Der Test war erfolgreich.');
      await call.hangup('Auf Wiedersehen!');

      console.log('✅ Call handled successfully');
    } catch (error) {
      console.error('❌ Error handling call:', error);
    }
  });

  session.on('call.ended', (callId) => {
    console.log('📵 Call ended:', callId);
  });

  session.on('error', (error) => {
    console.error('❌ Session error:', error);
  });

  // Keep alive
  console.log('Press Ctrl+C to stop\n');
}

test().catch(console.error);
```

Ausführen:

```bash
cd ../workshop
npx tsx test-client.ts
```

### Option B: Verwenden Sie Beispiel 01

```bash
cd ../workshop

# Beispiel anpassen für lokalen Server
```

Temporär in `examples/01-hello-world.ts` ändern:

```typescript
const session = await createVoiceSession({
  serverUrl: 'ws://localhost:3001' // Lokal statt Production
});

// Ihre Test-Rufnummer
await session.assignPhoneNumber('+4930XXXXXXXX');
```

Dann:

```bash
npm run example:01
```

## ✅ Schritt 8: Anruf testen

1. **Client läuft?** Check Terminal → "Waiting for calls..."
2. **Server läuft?** Check Terminal → Logs sichtbar
3. **ngrok läuft?** Check Terminal → Forwarding aktiv

**Jetzt anrufen:**
- Rufen Sie Ihre TENIOS-Nummer an (die Sie in `assignPhoneNumber()` eingetragen haben)

**Erwartete Logs im Server:**

```
[HTTP] POST /api/webhook
[Webhook] Received from TENIOS: { callId: 'call_123', to: '+4930XXXXXXXX', loopCount: 0, hasUserInput: false }
[Webhook] Routed to session abc-def-456
[SessionManager] Registered call call_123 to session abc-def-456
[WebSocket] Emitting call.incoming to session abc-def-456
[IVUVoiceService] Say (abc-def-456): Hallo! Dies ist ein Test...
```

**Erwartete Logs im Client:**

```
📞 CALL INCOMING!
   Call ID: call_123
✅ Call handled successfully
📵 Call ended: call_123
```

**Am Telefon hören Sie:**
> "Hallo! Dies ist ein Test des IVU Voice API Servers. Der Test war erfolgreich. Auf Wiedersehen!"

## ✅ Schritt 9: Erweiterte Tests

### Test 1: DTMF-Menü testen

```bash
npm run example:02
```

Anrufen und Tasten drücken (1, 2, oder 3).

### Test 2: Spracheingabe testen

```bash
npm run example:03
```

Anrufen und sprechen wenn gefragt.

### Test 3: KI-Konversation testen

```bash
npm run example:04
```

Anrufen und natürlich mit der KI reden.

## 🐛 Troubleshooting

### Problem: "Cannot connect to server"

**Check:**
```bash
# Läuft der Server?
curl http://localhost:3001/health

# Port belegt?
lsof -i :3001
```

### Problem: "Session created but no calls"

**Check:**
1. Richtige Rufnummer in `assignPhoneNumber()`?
2. TENIOS Webhook korrekt konfiguriert?
3. ngrok läuft noch?

**ngrok Web Interface:**
```
http://127.0.0.1:4040
```
→ Sehen Sie hier die eingehenden Requests von TENIOS?

### Problem: "TENIOS Webhook error"

**Server-Logs checken:**
```bash
# Im Server-Terminal sehen Sie alle Webhook-Requests
```

**ngrok Logs checken:**
```bash
# Im ngrok-Web-Interface (http://127.0.0.1:4040)
# Sehen Sie Request/Response
```

**Häufige Fehler:**
- ❌ TENIOS sendet zu `/` statt `/api/webhook` → URL in TENIOS prüfen
- ❌ ngrok Session expired → ngrok neu starten
- ❌ Server crashed → Server-Logs checken

### Problem: "No audio / silence"

**Check:**
1. OpenAI API Key korrekt?
2. Server-Logs → Sehen Sie TTS-Requests?
3. TENIOS SAY-Block wird gesendet?

**Debug im Server:**
```typescript
// Temporär in webhook.routes.ts nach executeAction():
console.log('Response blocks:', JSON.stringify(blocks, null, 2));
```

## 📊 Monitoring während Tests

### Terminal-Setup (4 Fenster)

**Terminal 1: Server**
```bash
cd ivu-voice-api-server
npm run dev
```

**Terminal 2: ngrok**
```bash
ngrok http 3001
```

**Terminal 3: Client**
```bash
cd workshop
npm run example:01
```

**Terminal 4: Monitoring**
```bash
# Sessions checken
watch -n 2 'curl -s http://localhost:3001/api/sessions | jq'

# Oder Health Check
watch -n 1 'curl -s http://localhost:3001/health | jq'
```

## ✅ Test-Checkliste

Bevor Sie auf Hetzner deployen, testen Sie:

- [ ] Server startet ohne Fehler
- [ ] Health Check funktioniert
- [ ] Client kann sich verbinden (WebSocket)
- [ ] Rufnummer kann zugewiesen werden
- [ ] TENIOS Webhook kommt an
- [ ] Call wird zu richtiger Session geroutet
- [ ] SAY-Block funktioniert (Ansage hörbar)
- [ ] COLLECT_SPEECH funktioniert (Spracheingabe)
- [ ] COLLECT_DIGITS funktioniert (DTMF)
- [ ] HANGUP beendet Anruf korrekt
- [ ] Session wird nach Call aufgeräumt
- [ ] Mehrere Calls nacheinander funktionieren
- [ ] Mehrere Sessions parallel funktionieren
- [ ] Error-Handling funktioniert (ungültige Eingaben)
- [ ] KI-Konversation funktioniert (OpenAI)

## 🎯 Nächste Schritte

Wenn alle Tests ✅ sind:

1. Server-Code committen
2. Deployment auf Hetzner vorbereiten
3. Production-Environment (.env) konfigurieren
4. SSL-Zertifikat einrichten
5. TENIOS auf Production-URL umstellen
6. Workshop-Repo finalisieren und auf GitHub pushen

---

**Happy Testing! 🚀**
