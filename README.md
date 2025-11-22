# KI Phone Connect - Voice Meter Reading System

Voice-basiertes Zählerstandserfassungssystem für Stadtwerke. Kunden rufen an und melden ihren Zählerstand per Sprache. Das System validiert die Eingaben und speichert sie automatisch.

## Projektstruktur

```
ki-phone-connect/
├── backend/               # Node.js + TypeScript Backend
│   ├── src/
│   │   ├── api/          # Express-Routen (Tenios Webhooks)
│   │   ├── services/     # Business Logic
│   │   ├── models/       # TypeScript Datenmodelle
│   │   ├── middleware/   # Express Middleware
│   │   ├── config/       # Konfiguration & Konstanten
│   │   └── utils/        # Logger, Hilfsfunktionen
│   ├── data/             # CSV-Dateien
│   └── dist/             # Kompilierter Code
└── frontend/             # React + Vite Frontend (geplant)
```

## Backend Setup

### 1. Dependencies installieren

```bash
cd backend
npm install --cache /tmp/empty-cache --prefer-online
```

### 2. Umgebungsvariablen

Die `.env` Datei ist bereits mit den richtigen API-Keys konfiguriert:

```env
OPENAI_API_KEY=sk-proj-...
TENIOS_API_KEY=9fd94019-4bb8-461e-9dbb-029701db5f5a
PORT=3000
```

### 3. Development Server starten

```bash
npm run dev
```

Der Server läuft auf `http://localhost:3000`

### 4. Server mit ngrok exponieren

In einem neuen Terminal:

```bash
ngrok http 3000
```

Kopiere die ngrok-URL (z.B. `https://abc123.ngrok-free.app`)

## Tenios Konfiguration

### Routingplan einrichten

1. Login bei Tenios: https://tenios.de
2. Gehe zu **Routingpläne** → **Neuer Routingplan**
3. **Schritt 1**: Call Control API
   - URL: `https://DEINE-NGROK-URL.ngrok-free.app/api/tenios/webhook/incoming`
   - Method: `POST`
4. **Schritt 2**: Bei Fehler → Weiterleitung an SIP Account "cwschroeder"
5. Routingplan speichern und der Rufnummer zuweisen

## SIP-Transkription mit Linphone

Der Node.js-Server verbindet sich nicht mehr direkt mit Tenios. Stattdessen läuft ein separater
Linphone-Client (GUI, CLI oder `linphone-daemon`), der die SIP-Zugangsdaten registriert,
Silent-Monitoring-Anrufe automatisch annimmt und den RTP-Stream als WAV-Datei speichert.

1. **Linphone installieren**
   - macOS: `brew install linphone`
   - Ubuntu: `sudo apt install linphone-daemon linphonec`

2. **Konfigurationsdatei erstellen (z. B. `~/.linphonerc-transcriber`)**

   ```ini
   [auth_info_0]
   username=cmschroeder
   passwd=<TENIOS_SIP_PASSWORD>
   realm=*
   domain=204671.tenios.com

   [proxy_0]
   reg_identity="sip:cmschroeder@204671.tenios.com"
   reg_proxy="sip:sip.tenios.com;transport=tls"
   reg_expires=300
   publish=0

   [app]
   auto_answer=yes

   [sound]
   record_file=/ABSOLUTER/PFAD/zu/ki-phone-connect/backend/linphone-recordings/call_%c.wav
   ```

   `%c` wird automatisch durch die SIP Call-ID ersetzt. Der Pfad muss mit `LINPHONE_RECORDINGS_DIR`
   aus der `.env` übereinstimmen (Standard: `backend/linphone-recordings`).

3. **Docker-basierte Linphone-Daemons**

   Im Ordner `backend/` liegen Beispielkonfigurationen sowie ein Compose-File:

   ```bash
   cd backend
   cp linphone-config/agent.linphonerc.example linphone-config/agent.linphonerc
   cp linphone-config/transcriber.linphonerc.example linphone-config/transcriber.linphonerc
   # Zugangsdaten (Benutzername/Passwort) eintragen und ggf. Geräte anpassen

   # Container starten (Agent + Transcriber)
   ./scripts/linphone/up.sh

   # Status / Logs
   docker compose -f docker-compose.linphone.yml ps
   docker logs -f linphone-agent
   docker logs -f linphone-transcriber

   # Container stoppen
   ./scripts/linphone/down.sh
   ```

   - `linphone-agent` registriert `env.AGENT_SIP_URI` und nimmt BRIDGE-Anrufe entgegen
   - `linphone-transcriber` registriert das Silent-Monitoring-Konto (`env.TRANSCRIPTION_SIP_URI`) und
     schreibt WAV-Dateien nach `backend/linphone-recordings/`

4. **Transkription im Backend**

   `src/services/SipTranscriptionService.ts` beobachtet das Recording-Verzeichnis. Sobald eine Datei
   fertig geschrieben wurde (kein Änderungsereignis mehr), wird sie automatisch mit OpenAI Whisper
   transkribiert und unter `data/transcriptions.csv` gespeichert. Der Dateiname (`call_<id>.wav`)
   dient als `call_id` in der CSV.

   Für Tests reicht es aus, eine beliebige WAV-Datei in `backend/linphone-recordings/` zu kopieren –
   der Watcher verarbeitet sie ebenfalls.

## Test-Daten

In `backend/data/customers.csv` sind Testkunden vorhanden:

| Kundennummer | Zählernummer | Kundenname      |
|--------------|--------------|-----------------|
| 12345        | M-789        | Max Mustermann  |
| 67890        | M-456        | Erika Schmidt   |
| 11111        | M-222        | Hans Mueller    |
| 22222        | M-333        | Anna Weber      |

## Testablauf

### 1. Server & ngrok starten

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: ngrok
ngrok http 3000
```

### 2. Tenios Webhook URL konfigurieren

Setze die ngrok-URL in deinem Tenios Routingplan

### 3. Testanruf durchführen

1. Rufe deine Tenios-Nummer an
2. System sagt: "Guten Tag. Willkommen beim Stadtwerk. Bitte nennen Sie Ihre Kundennummer."
3. Sage: "12345"
4. System fragt nach Zählernummer
5. Sage: "M-789"
6. System fragt nach Zählerstand
7. Sage: "5432"
8. System bestätigt und beendet Gespräch

### 4. Ergebnis prüfen

```bash
cat backend/data/meter-readings.csv
```

Du solltest einen neuen Eintrag sehen:

```csv
customer_number,meter_number,reading_value,reading_date,reading_time,call_id
12345,M-789,5432,2025-11-22,10:30:15,abc-123-def
```

## API Endpoints

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-22T10:00:00.000Z",
  "activeCalls": 0
}
```

### Tenios Webhooks

- `POST /api/tenios/webhook/incoming` - Neuer Anruf
- `POST /api/tenios/webhook/response` - Benutzer-Response
- `POST /api/tenios/webhook/completed` - Anruf beendet

## Technologie-Stack

**Backend:**
- Node.js 20.x + TypeScript 5.x
- Express.js für REST API
- OpenAI API (Whisper STT, GPT-4, TTS)
- CSV-Dateien mit File-Locking (proper-lockfile)
- Pino Logging mit Correlation IDs
- Zod für Validation

**Geplant (Frontend):**
- React 18 + Vite
- Tailwind CSS
- WebSocket für Live-Transkripte
- Supervisor Dashboard

## Entwicklung

### TypeScript kompilieren

```bash
npm run type-check  # Nur prüfen
npm run build       # Kompilieren nach dist/
```

### Linting

```bash
npm run lint        # ESLint check
npm run lint:fix    # Auto-fix
```

## Deployment (geplant)

**Zielplattform:** Hetzner VPS (Ubuntu 22.04 LTS)

```bash
# Build
npm run build

# PM2 starten
pm2 start dist/index.js --name ki-phone-connect

# Nginx Reverse Proxy mit SSL
# Webhook URL: https://your-domain.com/api/tenios/webhook/incoming
```

## Troubleshooting

### Server startet nicht

```bash
# Prüfe ob Port 3000 frei ist
lsof -i :3000

# Prüfe Logs
npm run dev
```

### Tenios Webhook schlägt fehl

1. Prüfe ngrok läuft: `curl https://YOUR-NGROK-URL.ngrok-free.app/health`
2. Prüfe Tenios Routingplan URL ist korrekt
3. Schaue in Backend Logs nach Errors

### Audio wird nicht generiert

1. Prüfe OpenAI API Key: `echo $OPENAI_API_KEY`
2. Prüfe OpenAI Account hat Credits
3. Schaue in Logs nach OpenAI Errors

## Next Steps

- [ ] WebSocket-Server für Live-Transkripte
- [ ] React Frontend mit Supervisor Dashboard
- [ ] JWT Authentication
- [ ] Unit & Integration Tests
- [ ] Deployment auf Hetzner VPS

## Lizenz

MIT
