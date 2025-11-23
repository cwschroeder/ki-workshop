# IVU Voice API

Vereinfachte Abstraktionsschicht für TENIOS Call Control API mit KI-Integration.

## 🎯 Überblick

Die IVU Voice API verbirgt die Komplexität der TENIOS Call Control API hinter einer einfachen WebSocket-basierten Schnittstelle. Workshop-Teilnehmer können Voice-Anwendungen entwickeln, ohne sich um Webhooks, ngrok oder TENIOS-spezifische Details kümmern zu müssen.

### Hauptmerkmale

- ✅ **WebSocket-basiert**: Keine Webhooks beim Client nötig
- ✅ **Provider-Abstraktion**: Einfacher Wechsel zwischen OpenAI und lokalen LLMs
- ✅ **TypeScript**: Vollständige Typsicherheit
- ✅ **Workshop-ready**: Einfache API für Teilnehmer
- ✅ **Produktionsreif**: Logging, Error Handling, Validation

## 📦 Installation

```bash
npm install
```

## ⚙️ Konfiguration

1. Kopieren Sie `.env.example` zu `.env`:

```bash
cp .env.example .env
```

2. Konfigurieren Sie die Umgebungsvariablen:

```env
# TENIOS
TENIOS_API_KEY=9fd94019-4bb8-461e-9dbb-029701db5f5a

# AI Provider (openai oder local-llm)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-your-key-here

# Server
PORT=3001
WS_PORT=3002
```

## 🚀 Starten

### Entwicklung

```bash
npm run dev
```

### Produktion

```bash
npm run build
npm start
```

## 🏗️ Architektur

```
┌─────────────────┐
│ Workshop Client │ (Browser/Node.js)
└────────┬────────┘
         │ WebSocket
         ↓
┌─────────────────────────┐
│   IVU Voice API Server  │
│  ┌───────────────────┐  │
│  │ SessionManager    │  │ Verwaltet Sessions
│  ├───────────────────┤  │
│  │ IVUVoiceService   │  │ Business Logic
│  ├───────────────────┤  │
│  │ AI Provider       │  │ OpenAI / Local LLM
│  ├───────────────────┤  │
│  │ Telephony Provider│  │ TENIOS
│  └───────────────────┘  │
└────────┬────────────────┘
         │ Webhooks
         ↓
┌─────────────────┐
│  TENIOS API     │
└─────────────────┘
```

### Provider-System

**AI Provider:**
- `IAIProvider` - Interface (STT, TTS, LLM, Extraktion)
- `OpenAIProvider` - OpenAI-Implementierung (aktuell)
- `LocalLLMProvider` - Lokale LLMs (Ollama, whisper.cpp)

**Telephony Provider:**
- `ITelephonyProvider` - Interface (Call Control)
- `TeniosProvider` - TENIOS-Implementierung
- Zukünftig: Twilio, Vonage, etc.

**Wechsel von OpenAI zu lokalem LLM:**

```env
# Vorher
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Nachher (kein Code-Change nötig!)
AI_PROVIDER=local-llm
LOCAL_LLM_URL=http://localhost:11434
```

## 📡 API-Endpunkte

### REST API

| Endpunkt | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health Check + Statistiken |
| `/api/webhook` | POST | TENIOS Webhook (intern) |
| `/api/sessions` | GET | Alle aktiven Sessions |
| `/api/sessions/cleanup` | POST | Inaktive Sessions aufräumen |

### WebSocket Events

**Client → Server:**
- `call.action` - Call-Aktion ausführen (say, collect, etc.)
- `session.info` - Session-Infos abrufen
- `phone.assign` - Rufnummer zuweisen
- `ping` - Keepalive

**Server → Client:**
- `session.created` - Session erstellt
- `call.incoming` - Eingehender Anruf
- `call.user_input` - Benutzereingabe empfangen
- `call.ended` - Anruf beendet
- `ai.response` - KI-Antwort (bei AI Conversation)

## 💻 Client SDK Verwendung

```typescript
import { createVoiceSession } from './src/client/IVUVoiceClient';

// Session erstellen
const session = await createVoiceSession({
  wsUrl: 'ws://localhost:3001'
});

// Rufnummer zuweisen
await session.assignPhoneNumber('+49301234567');

// Event-Handler
session.on('call.incoming', async (call) => {
  // Begrüßung
  await call.say('Willkommen beim Stadtwerk!');

  // Menü
  const choice = await call.collectDigits({
    maxDigits: 1,
    prompt: 'Drücken Sie 1 für Zählerstand, 2 für Mitarbeiter'
  });

  if (choice === '1') {
    // Zählerstand-Flow
    const customerNumber = await call.collectSpeech({
      prompt: 'Bitte nennen Sie Ihre Kundennummer'
    });

    // ... weitere Logik
  } else if (choice === '2') {
    await call.transfer('sip:agent@tenios.com');
  }

  await call.hangup('Auf Wiedersehen!');
});

// Starten
await session.start();
```

## 🔧 Entwicklung

### Verzeichnisstruktur

```
src/
├── providers/
│   ├── ai/
│   │   ├── IAIProvider.ts           # AI Interface
│   │   ├── OpenAIProvider.ts        # OpenAI Impl.
│   │   └── LocalLLMProvider.ts      # Lokales LLM
│   └── telephony/
│       ├── ITelephonyProvider.ts    # Telephony Interface
│       └── TeniosProvider.ts        # TENIOS Impl.
├── services/
│   ├── SessionManager.ts            # Session-Verwaltung
│   └── IVUVoiceService.ts           # Haupt-Business-Logik
├── websocket/
│   └── VoiceWebSocketHandler.ts     # WebSocket-Handler
├── api/
│   └── webhook.routes.ts            # TENIOS Webhook
├── models/
│   ├── VoiceSession.ts              # Datenmodelle
│   └── CallAction.ts                # Action-Types
├── client/
│   └── IVUVoiceClient.ts            # Client SDK
├── config/
│   └── env.ts                       # Environment Config
└── index.ts                         # Server Entry Point
```

### Scripts

```bash
npm run dev          # Development mit Hot Reload
npm run build        # TypeScript kompilieren
npm start            # Produktion starten
npm run type-check   # TypeScript-Fehler prüfen
npm run lint         # ESLint ausführen
npm run lint:fix     # ESLint mit Auto-Fix
```

## 🐛 Debugging

### Logs

Der Server loggt alle wichtigen Events:

```
[SessionManager] Created session abc-123
[WebSocket] Client connected: xyz-789
[Webhook] Received from TENIOS: callId=call-456
[IVUVoiceService] Say (abc-123): Willkommen...
```

### Health Check

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "ok",
  "timestamp": "2025-11-23T10:00:00.000Z",
  "totalSessions": 5,
  "activeCalls": 2,
  "assignedPhones": 3,
  "providers": {
    "ai": "OpenAI",
    "telephony": "TENIOS"
  }
}
```

### Session-Liste

```bash
curl http://localhost:3001/api/sessions
```

## 🔐 Sicherheit

**Produktions-Deployment:**

1. **Environment-Variablen** nie in Git committen
2. **CORS** einschränken auf bekannte Origins
3. **Rate Limiting** für Webhooks implementieren
4. **HTTPS/WSS** für Produktion verwenden
5. **API-Keys** rotieren

**Workshop-Modus:**

- CORS offen (`ENABLE_CORS=true`)
- Keine Authentifizierung (nur für Workshop!)
- Maximale Log-Ausgabe

## 📚 Weitere Dokumentation

- [TENIOS Call Control API](https://www.tenios.de/doc/external-call-control-api)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Socket.io Documentation](https://socket.io/docs/v4)

## 🤝 Workshop Support

Bei Fragen während des Workshops:

1. Health Check prüfen: `curl http://localhost:3001/health`
2. Logs überprüfen (Terminal)
3. Session-Liste ansehen: `GET /api/sessions`
4. Instructor fragen

## 📝 Lizenz

MIT - IVU Traffic Technologies AG
