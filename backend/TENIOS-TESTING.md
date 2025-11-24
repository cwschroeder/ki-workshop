# TENIOS Human Agent Testing Guide

Anleitung zum Testen des Voice Agent Systems mit echten Agenten über TENIOS.

## Übersicht

Das System unterstützt zwei TENIOS-Integrations-Modi:

1. **Webhook-basiert** (Call Control API) - AI-gesteuerte Gespräche mit optionaler Agent-Übergabe
2. **SIP/RTP-basiert** (VoiceAgentService) - Echtzeit Voice Streaming (<500ms Latenz)

## Voraussetzungen

- TENIOS-Account mit Test-Telefonnummer
- SIP-Client (Linphone, Zoiper, oder Hardware-Phone)
- ngrok für lokale Entwicklung
- Backend läuft lokal (`npm run dev`)

## Quick Start: Direkter Agent-Transfer

### 1. Umgebungsvariablen konfigurieren

```bash
# In .env
FORCE_AGENT_BRIDGE=true
AGENT_SIP_URI=sip:cwschroeder@204671.tenios.com
```

### 2. Services starten

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: ngrok
ngrok http 3000
# Notiere die ngrok URL: https://xxxx.ngrok-free.app
```

### 3. TENIOS Routing-Plan konfigurieren

Login: https://tenios.de → Routingpläne

**Schritt 1: Call Control API**
- URL: `https://xxxx.ngrok-free.app/`
- Method: POST
- Timeout: 10s

**Schritt 2: Fallback (optional)**
- Destination: `sip:cwschroeder@204671.tenios.com`
- Type: SIP_USER
- Timeout: 30s

### 4. SIP-Client einrichten

#### Option A: Linphone (macOS)

```bash
# Installation
brew install linphone

# Config erstellen
cat > ~/.linphonerc-agent << EOF
[auth_info_0]
username=cwschroeder
passwd=passwort123456
realm=*
domain=204671.tenios.com

[proxy_0]
reg_identity="sip:cwschroeder@204671.tenios.com"
reg_proxy="sip:sip.tenios.com;transport=tls"
reg_expires=300
publish=0

[app]
auto_answer=no
EOF

# Starten
linphonec -c ~/.linphonerc-agent
```

#### Option B: Docker-basiertes Linphone

```bash
cd backend

# Config vorbereiten
cp linphone-config/agent.linphonerc.example linphone-config/agent.linphonerc
# Bearbeiten: username=cwschroeder, passwd=passwort123456

# Container starten
./scripts/linphone/up.sh

# Logs überwachen
docker logs -f linphone-agent
```

#### Option C: TENIOS Web-Client oder Mobile App

Verwende einen SIP-Softphone wie Zoiper oder Linphone mit denselben Credentials.

### 5. Test durchführen

1. Rufe deine TENIOS-Nummer an (z.B. +49 30 XXXXXXXX)
2. Du hörst: "Sie werden mit einem Mitarbeiter verbunden"
3. SIP-Client klingelt
4. Annehmen und Gespräch führen

### 6. Logs überprüfen

```bash
# Backend Logs
tail -f logs/app.log | grep -E "BRIDGE|Agent transfer|Tenios webhook"

# Erwartete Webhook Response
{
  "blocks": [
    {
      "blockType": "SAY",
      "text": "Vielen Dank, Sie werden sofort mit einem Mitarbeiter verbunden.",
      "voiceName": "de.female.2"
    },
    {
      "blockType": "BRIDGE",
      "bridgeMode": "SEQUENTIAL",
      "destinations": [
        {
          "destination": "sip:cwschroeder@204671.tenios.com",
          "destinationType": "SIP_USER",
          "timeout": 30
        }
      ]
    }
  ]
}
```

## Alternative Modi

### Modus 1: AI-First mit optionaler Agent-Übergabe

```bash
# In .env
FORCE_AGENT_BRIDGE=false
SIMULATE_HUMAN_AGENT=false
```

**Test-Ablauf:**
1. Kunde ruft an
2. AI führt Gespräch
3. Kunde sagt: "Ich möchte mit einem Mitarbeiter sprechen"
4. System übergibt an echten Agent via BRIDGE

### Modus 2: AI-Simulation (kein echter Agent)

```bash
# In .env
FORCE_AGENT_BRIDGE=false
SIMULATE_HUMAN_AGENT=true
```

**Test-Ablauf:**
1. Kunde ruft an
2. AI führt Gespräch
3. Bei Agent-Wunsch: AI simuliert menschlichen Agent
4. Kein SIP-Bridge findet statt

## Silent Monitoring (Call Recording)

Für Transkription und Aufzeichnung von Agent-Gesprächen:

### Setup

1. **SUPERVISOR_KEY von TENIOS anfordern**
   - Kontaktiere TENIOS Support
   - Request API key für Silent Monitoring
   - Trage in `.env` ein: `SUPERVISOR_KEY=dein_key_hier`

2. **Code aktivieren**

In `src/index.ts` (Zeilen 87-96 und 165-176) auskommentieren:

```typescript
// Silent monitoring starten
if (env.SUPERVISOR_KEY) {
  try {
    await teniosService.startListenIn({
      callId: req.body.callId,
      phoneNumber: env.TRANSCRIPTION_PHONE_NUMBER,
      announceTranscriber: false,
    });
    logger.info({ callId: req.body.callId }, 'Silent monitoring started');
  } catch (error) {
    logger.error({ callId: req.body.callId, error }, 'Failed to start silent monitoring');
  }
}
```

3. **Linphone Container starten** (falls noch nicht aktiv)

```bash
./scripts/linphone/up.sh
```

4. **Test durchführen**

- Agent-Gespräch wird aufgezeichnet: `linphone-recordings/call_*.wav`
- Auto-Transkription erfolgt nach Gesprächsende
- Ergebnisse: `data/transcriptions.csv`

## Troubleshooting

### Problem: SIP-Client klingelt nicht

**Lösung:**
1. Prüfe SIP-Registration:
   ```bash
   tail -f logs/app.log | grep "SIP.*REGISTER"
   ```
2. Prüfe TENIOS Routing-Plan Konfiguration
3. Prüfe SIP-Client Credentials

### Problem: Webhook antwortet nicht

**Lösung:**
1. Prüfe ngrok URL:
   ```bash
   curl https://xxxx.ngrok-free.app/health
   # Erwartete Antwort: {"status":"ok"}
   ```
2. Prüfe Backend Logs:
   ```bash
   tail -f logs/app.log | grep "Tenios webhook"
   ```

### Problem: NAT/Firewall blockiert RTP

**Lösung:**
- Verwende TENIOS-basierte SIP-Clients (Web oder Mobile)
- Oder konfiguriere Port-Forwarding für UDP 5060 + 10000-20000

### Problem: Audio-Qualität schlecht

**Ursache:** 8kHz Telephony-Codec (G.711 PCMU/PCMA)

**Verbesserungen:**
1. Verwende kabelgebundenes Netzwerk (kein WiFi)
2. Schließe andere Bandbreiten-intensive Anwendungen
3. Prüfe Codec-Einstellungen im SIP-Client (bevorzuge PCMU)

## Nächste Schritte für Production

1. **PUBLIC_IP konfigurieren**
   - Für Hetzner VPS: `PUBLIC_IP=<vps_ip>` in `.env`
   - Oder: Auto-Detection via SIP REGISTER (Via received parameter)

2. **SSL-Zertifikat**
   - Let's Encrypt für Webhook-Endpoint
   - TLS-Transport für SIP (optional, aber empfohlen)

3. **Monitoring einrichten**
   - Call-Logs: `data/transcriptions.csv`
   - Recordings: `linphone-recordings/*.wav`
   - System-Logs: `logs/app.log`

4. **Load Testing**
   - Test mit mehreren gleichzeitigen Anrufen
   - Prüfe `MAX_CONCURRENT_CALLS` Limit
   - Monitor CPU/RAM usage

## Relevante Dateien

- `/src/index.ts:65-366` - Webhook Handler (Call Control API)
- `/src/api/tenios.routes.ts` - Alternative Webhook Routes
- `/src/services/VoiceAgentService.ts` - SIP/RTP Integration
- `/src/services/TeniosService.ts` - TENIOS API Client
- `/.env.example` - Konfigurationsvorlage

## Support

Bei Problemen:
1. Logs prüfen: `tail -f logs/app.log`
2. WebSocket Transkripte prüfen (falls Dashboard läuft)
3. TENIOS Dashboard: https://tenios.de (Call History, Routing Plan Status)
