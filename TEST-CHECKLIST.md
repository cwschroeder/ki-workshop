# Test-Checkliste vor Hetzner-Deployment

Vollständige Checkliste für lokale Tests mit ngrok.

## 📋 Vor dem Test

### Server-Vorbereitung

- [ ] **Dependencies installiert**
  ```bash
  cd ivu-voice-api-server
  npm install
  ```

- [ ] **.env konfiguriert**
  ```bash
  cp .env.example .env
  # OPENAI_API_KEY eingetragen
  ```

- [ ] **TypeScript kompiliert ohne Fehler**
  ```bash
  npm run type-check
  ```

### Workshop-Client-Vorbereitung

- [ ] **Dependencies installiert**
  ```bash
  cd workshop
  npm install
  ```

- [ ] **Test-Client angepasst**
  - Rufnummer in `test-client.ts` Zeile 30 eingetragen

### Externe Tools

- [ ] **ngrok installiert**
  ```bash
  ngrok version
  ```

- [ ] **TENIOS-Zugangsdaten bereit**
  - Dashboard-Login vorhanden
  - Test-Rufnummer vorhanden

## 🧪 Test-Durchführung

### Phase 1: Server-Start

- [ ] **Server startet ohne Fehler**
  ```bash
  cd ivu-voice-api-server
  npm run dev
  ```
  Erwartete Ausgabe: `✅ IVU Voice API Server started`

- [ ] **Health Check erfolgreich**
  ```bash
  curl http://localhost:3001/health | jq
  ```
  Status: `"ok"`, Providers vorhanden

- [ ] **Sessions-Endpoint funktioniert**
  ```bash
  curl http://localhost:3001/api/sessions | jq
  ```
  Leeres Array: `{"count":0,"sessions":[]}`

### Phase 2: ngrok-Setup

- [ ] **ngrok gestartet**
  ```bash
  ngrok http 3001
  ```

- [ ] **ngrok-URL notiert**
  Format: `https://xxxxxxxx.ngrok-free.app`

- [ ] **ngrok Web UI erreichbar**
  ```bash
  open http://127.0.0.1:4040
  ```

- [ ] **Test-Request über ngrok**
  ```bash
  curl https://xxxxxxxx.ngrok-free.app/health | jq
  ```
  Gleiche Antwort wie lokal

### Phase 3: TENIOS-Konfiguration

- [ ] **TENIOS-Dashboard geöffnet**
  Login erfolgreich

- [ ] **Test-Rufnummer ausgewählt**
  Nummer notiert: `+4930XXXXXXXX`

- [ ] **Routing konfiguriert**
  - Routing-Typ: Call Control API
  - Webhook-URL: `https://xxxxxxxx.ngrok-free.app/api/webhook`
  - Gespeichert

- [ ] **Konfiguration aktiv**
  Status in TENIOS: Aktiv

### Phase 4: Client-Test

- [ ] **Test-Client gestartet**
  ```bash
  cd workshop
  npx tsx test-client.ts
  ```
  Ausgabe: `✅ Connected to IVU Voice API Server`

- [ ] **Rufnummer zugewiesen**
  Ausgabe: `✅ Phone number assigned`

- [ ] **Client wartet auf Calls**
  Ausgabe: `⏳ Waiting for calls...`

### Phase 5: Erster Anruf

- [ ] **Anruf getätigt**
  TENIOS-Nummer angerufen

- [ ] **Server empfängt Webhook**
  Server-Log: `[Webhook] Received from TENIOS`

- [ ] **Call geroutet**
  Server-Log: `[Webhook] Routed to session`

- [ ] **Client empfängt Event**
  Client-Log: `📞 INCOMING CALL!`

- [ ] **Ansage hörbar**
  Am Telefon: "Hallo! Willkommen..."

- [ ] **Anruf endet korrekt**
  - Client-Log: `✅ Call handled successfully`
  - Server-Log: `[SessionManager] Ended call`

### Phase 6: Beispiel-Tests

- [ ] **Beispiel 01 funktioniert**
  ```bash
  npm run example:01
  # Anrufen → "Willkommen beim IVU Voice API Workshop"
  ```

- [ ] **Beispiel 02 funktioniert (DTMF)**
  ```bash
  npm run example:02
  # Anrufen → Tasten drücken → Entsprechende Ansage
  ```

- [ ] **Beispiel 03 funktioniert (ASR)**
  ```bash
  npm run example:03
  # Anrufen → Sprechen → Transkription funktioniert
  ```

- [ ] **Beispiel 04 funktioniert (KI)**
  ```bash
  npm run example:04
  # Anrufen → Mit KI sprechen → Natürlicher Dialog
  ```

### Phase 7: Erweiterte Tests

- [ ] **Mehrere Calls hintereinander**
  - 1. Anruf → funktioniert
  - 2. Anruf → funktioniert
  - 3. Anruf → funktioniert

- [ ] **Parallel-Sessions (2 Terminals)**
  Terminal 1: `npx tsx test-client.ts`
  Terminal 2: `npx tsx examples/01-hello-world.ts`
  - Beide verbunden
  - Verschiedene Sessions erstellt
  - Calls werden korrekt geroutet

- [ ] **Error-Handling: Ungültige Eingabe**
  Beispiel 02 starten → Ungültige Ziffer drücken (z.B. 9)
  - Server fängt Fehler ab
  - Client bekommt Error-Event
  - Anruf endet höflich

- [ ] **Error-Handling: Timeout**
  Beispiel 03 starten → Lange schweigen
  - Timeout tritt ein
  - Server antwortet korrekt
  - Anruf endet

- [ ] **Session-Cleanup**
  ```bash
  curl -X POST http://localhost:3001/api/sessions/cleanup
  ```
  - Inaktive Sessions werden entfernt

### Phase 8: Monitoring & Debugging

- [ ] **ngrok Logs zeigen Requests**
  http://127.0.0.1:4040 → Requests von TENIOS sichtbar

- [ ] **Server-Logs sind aussagekräftig**
  - Timestamps vorhanden
  - Correlation IDs vorhanden
  - Error-Messages klar

- [ ] **Sessions-API funktioniert**
  ```bash
  curl http://localhost:3001/api/sessions | jq
  ```
  - Aktive Sessions sichtbar
  - Assigned Phone Numbers korrekt
  - Active Call IDs vorhanden

## 🐛 Fehlersuche

Falls Tests fehlschlagen:

### Server startet nicht

- [ ] Port 3001 frei?
  ```bash
  lsof -i :3001
  ```

- [ ] Node Version >= 20?
  ```bash
  node --version
  ```

- [ ] Dependencies installiert?
  ```bash
  ls node_modules/ | wc -l
  # Sollte > 0 sein
  ```

### Client kann sich nicht verbinden

- [ ] Server läuft?
  ```bash
  curl http://localhost:3001/health
  ```

- [ ] WebSocket-Port korrekt?
  In `test-client.ts`: `ws://localhost:3001` (nicht 3002!)

- [ ] Firewall blockiert?

### Keine Webhooks von TENIOS

- [ ] ngrok läuft?
  ```bash
  curl https://xxxxxxxx.ngrok-free.app/health
  ```

- [ ] TENIOS URL korrekt?
  Mit `/api/webhook` am Ende!

- [ ] TENIOS Routing aktiv?
  Dashboard prüfen

- [ ] ngrok Web UI zeigt Requests?
  http://127.0.0.1:4040

### Keine Ansage hörbar

- [ ] OpenAI API Key gültig?
  ```bash
  grep OPENAI_API_KEY .env
  ```

- [ ] Server-Logs zeigen TTS-Request?
  `[IVUVoiceService] Say`

- [ ] TENIOS sendet SAY-Block?
  In ngrok UI: Response-Body prüfen

## ✅ Test erfolgreich!

Wenn alle Tests ✅ sind:

**Sie können jetzt auf Hetzner deployen!**

Nächste Schritte:
1. Code committen (Git)
2. Hetzner VPS aufsetzen
3. Deployment-Guide folgen (siehe `README.md`)
4. Production-URL in TENIOS konfigurieren
5. Workshop-Repo auf GitHub veröffentlichen

---

**Test-Datum:** ___________
**Getestet von:** ___________
**Alle Tests bestanden:** [ ] Ja [ ] Nein
**Bereit für Deployment:** [ ] Ja [ ] Nein

**Notizen:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```
