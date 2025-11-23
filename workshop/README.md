# IVU Voice API Workshop

Willkommen zum IVU Voice API Workshop! In diesem Workshop lernen Sie, wie Sie Voice-Anwendungen mit der vereinfachten IVU Voice API erstellen können - ohne ngrok oder komplexe Webhook-Infrastruktur.

## 🎯 Was Sie lernen werden

- **Voice-Anwendungen** mit TENIOS Call Control API erstellen
- **Spracheingabe (ASR)** und **Text-to-Speech (TTS)** nutzen
- **KI-gestützte Gespräche** mit OpenAI/lokalen LLMs implementieren
- **DTMF-Menüs** und **Call-Routing** aufbauen
- **Daten-Validierung** gegen CSV-Dateien
- **Real-time Call-Monitoring** via WebSocket

## 📋 Voraussetzungen

- **Node.js 20+** installiert
- **npm** oder **yarn**
- **TENIOS API-Key** (wird im Workshop bereitgestellt)
- **OpenAI API-Key** (optional, für KI-Features)
- Ein **SIP-Client** oder **Telefon** zum Testen

## 🚀 Schnellstart

### 1. Repository klonen

```bash
git clone https://github.com/ivu/voice-workshop.git
cd voice-workshop
```

### 2. Abhängigkeiten installieren

```bash
npm install
```

### 3. IVU Voice API Server-URL

Der IVU Voice API Server läuft bereits bei IVU:
- **Production:** `wss://voice-api.ivu.de`
- **Workshop:** Wird im Workshop bekanntgegeben

Sie brauchen **keine** eigene Server-Infrastruktur!

## 📚 Tutorial-Struktur

Das Workshop-Tutorial besteht aus 6 aufeinander aufbauenden Beispielen:

### Beispiel 1: Hello World (10 min)
**Datei:** `examples/01-hello-world.ts`

Ihr erster Voice-Call:
- Anruf entgegennehmen
- Begrüßung aussprechen
- Anruf beenden

```typescript
session.on('call.incoming', async (call) => {
  await call.say('Willkommen beim IVU Workshop!');
  await call.hangup();
});
```

### Beispiel 2: DTMF-Menü (15 min)
**Datei:** `examples/02-dtmf-menu.ts`

Interaktives Menü mit Zifferneingabe:
- Menü-Optionen vorlesen
- DTMF-Eingabe sammeln
- Verzweigung basierend auf Auswahl

```typescript
const choice = await call.collectDigits({
  maxDigits: 1,
  prompt: 'Drücken Sie 1 für Zählerstand, 2 für Mitarbeiter'
});

if (choice === '1') {
  // Zählerstand-Flow
} else if (choice === '2') {
  await call.transfer('sip:agent@tenios.com');
}
```

### Beispiel 3: Spracheingabe (20 min)
**Datei:** `examples/03-speech-input.ts`

Automatische Spracherkennung (ASR):
- Spracheingabe sammeln
- Transkription verarbeiten
- Nummer extrahieren

```typescript
const speech = await call.collectSpeech({
  prompt: 'Bitte nennen Sie Ihre Kundennummer',
  language: 'de-DE'
});

console.log('Kunde sagte:', speech);
```

### Beispiel 4: KI-Konversation (25 min)
**Datei:** `examples/04-ai-conversation.ts`

KI-gestützter Dialog mit OpenAI:
- Natürliche Konversation
- Kontext über mehrere Turns
- Automatische Daten-Extraktion

```typescript
await call.aiConversation({
  systemPrompt: `Du bist ein freundlicher Assistent.
  Sammle: Kundennummer, Zählernummer, Zählerstand.
  Bestätige und beende mit [END_CALL]`,
  maxTurns: 10
});
```

### Beispiel 5: Zählerstand komplett (20 min)
**Datei:** `examples/05-meter-reading.ts`

Vollständige Zählerstand-Erfassung:
- Kundennummer validieren (CSV)
- Zählernummer prüfen
- Stand erfassen und speichern
- Bestätigung

```typescript
// Validierung gegen CSV
const customer = await session.lookupCustomer(customerNumber);
if (!customer) {
  await call.say('Kundennummer nicht gefunden');
  return;
}

// Speichern
await session.saveMeterReading({
  customerNumber,
  meterNumber,
  reading,
  timestamp: new Date()
});
```

### Beispiel 6: Pizza-Bestellung (Bonus, 30 min)
**Datei:** `examples/06-pizza-order.ts`

Offene Aufgabe:
- Pizza-Größe abfragen
- Belag-Auswahl (mehrere)
- Adresse erfassen
- Bestellung zusammenfassen

## 🗂️ Projekt-Struktur

```
voice-workshop/              # GitHub Repository für Teilnehmer
├── lib/                     # IVU Voice Client SDK
│   └── ivu-voice-client.ts  # SDK zum Verbinden mit IVU-Server
│
├── workshop-data/           # CSV-Daten
│   ├── customers.csv        # Test-Kunden
│   ├── meter-readings.csv   # Gespeicherte Zählerstände
│   └── transcriptions.csv   # Gesprächsverläufe
│
├── examples/                # Tutorial-Code
│   ├── 01-hello-world.ts    # Erster Call
│   ├── 02-dtmf-menu.ts      # DTMF-Menü
│   ├── 03-speech-input.ts   # Spracheingabe
│   ├── 04-ai-conversation.ts # KI-Dialog
│   ├── 05-meter-reading.ts  # Vollständiges Beispiel
│   └── 06-pizza-order.ts    # Bonus-Aufgabe
│
├── docs/                    # Dokumentation
│   ├── tutorial.md          # Detailliertes Tutorial
│   └── troubleshooting.md   # Fehlerbehandlung
│
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript Config
└── README.md                # Diese Datei
```

**Hinweis:** Der IVU Voice API Server läuft separat bei IVU. Sie brauchen nur dieses Repository!

## 🔧 API-Übersicht

### Session erstellen

```typescript
import { createVoiceSession } from './lib/ivu-voice-client';

// Verbindet automatisch mit IVU Voice API Server
const session = await createVoiceSession();
```

### Call-Events

```typescript
session.on('call.incoming', async (call) => {
  // Neuer Anruf
});

session.on('call.ended', (callId) => {
  // Anruf beendet
});

session.on('error', (error) => {
  // Fehler aufgetreten
});
```

### Call-Actions

```typescript
// Text aussprechen
await call.say(text: string)

// Ziffern sammeln (DTMF)
await call.collectDigits({ maxDigits: number, timeout?: number })

// Sprache sammeln (ASR)
await call.collectSpeech({ language: string, timeout?: number })

// KI-Konversation
await call.aiConversation({ systemPrompt: string, maxTurns?: number })

// Call weiterleiten
await call.transfer(destination: string)

// Anruf beenden
await call.hangup(message?: string)
```

### Daten-Helper

```typescript
// Kunde nachschlagen
const customer = await session.lookupCustomer(customerNumber)

// Zählerstand speichern
await session.saveMeterReading({ customerNumber, meterNumber, reading })

// Informationen extrahieren (KI)
const info = await call.extractCustomerInfo(speechText)
```

## 🔐 Konfiguration

**Keine Konfiguration nötig!** Der IVU Voice API Server ist bereits konfiguriert.

Optional können Sie die Server-URL ändern (z.B. für lokale Tests):

```typescript
const session = await createVoiceSession({
  serverUrl: 'ws://localhost:3001' // Nur für lokale Entwicklung
});

## 🧪 Testen

### Beispiele ausführen

```bash
# Beispiel 1 starten
npm run example:01

# Beispiel 2 starten
npm run example:02

# etc.
```

### Eigene Rufnummer verwenden

Im Workshop wird Ihnen eine Test-Rufnummer zugeteilt. Tragen Sie diese in Ihrem Code ein:

```typescript
const session = await createVoiceSession();

// Ihre zugewiesene Workshop-Nummer
await session.assignPhoneNumber('+49301234567');
```

Dann können Sie diese Nummer anrufen und Ihre Anwendung testen!

## 🐛 Troubleshooting

### Problem: "Cannot connect to IVU Voice API"

**Lösung:**
1. Überprüfen Sie Ihre Internetverbindung
2. Ist der Workshop-Server erreichbar? (Fragen Sie den Instructor)
3. Firewall blockiert WebSocket-Verbindungen?

### Problem: "Session created but no calls incoming"

**Lösung:**
1. Haben Sie eine Rufnummer zugewiesen? `session.assignPhoneNumber(...)`
2. Rufen Sie die richtige Nummer an?
3. Ist Ihr Code aktiv und wartet auf Events?

### Problem: "User input not received"

**Lösung:**
1. Sprechen Sie klar und deutlich
2. Warten Sie auf die Ansage, bevor Sie sprechen
3. Hintergrundgeräusche minimieren
4. Bei DTMF: Tasten fest drücken

## 📖 Weiterführende Ressourcen

- **TENIOS Call Control API:** https://www.tenios.de/doc/external-call-control-api
- **OpenAI API Docs:** https://platform.openai.com/docs
- **Socket.io Docs:** https://socket.io/docs/v4
- **TypeScript Handbook:** https://www.typescriptlang.org/docs

## 🤝 Support

Bei Fragen während des Workshops:
- **Instructor fragen** (präsent)
- **GitHub Issues:** https://github.com/ivu/voice-workshop/issues
- **TENIOS Support:** support@tenios.de

## 📝 Lizenz

MIT License - IVU Traffic Technologies AG

---

**Viel Erfolg beim Workshop! 🎉**
