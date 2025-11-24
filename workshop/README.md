# IVU Voice API Workshop

Willkommen zum IVU Voice API Workshop! In diesem Workshop lernen Sie, wie Sie Voice-Anwendungen mit der IVU Voice API erstellen können.

## 🎯 Was Sie lernen werden

**Teil 1: API-Funktionen kennenlernen**
- Text-to-Speech (TTS) verwenden
- Spracheingabe (ASR) verarbeiten
- DTMF-Eingaben (Zifferntasten) erfassen
- Professionelle Ansagen abspielen
- Anrufe weiterleiten (Transfer/Bridge)
- Anrufaufzeichnung nutzen
- Ausgehende Anrufe tätigen (MakeCall)
- SMS versenden

**Teil 2: Praxis-Projekt Zählerstandserfassung**
- Voice-Bot mit KI-Unterstützung bauen
- Kundendaten aus CSV validieren
- Zählerstände per Sprache erfassen
- Eingaben validieren und speichern
- CSV-Dateien lesen und schreiben
- Fehlerbehandlung implementieren

## 📋 Voraussetzungen

- **Node.js 20+** installiert
- **npm** (kommt mit Node.js)
- **Telefon** zum Testen der Anrufe
- **IVU Voice API Server** läuft auf `mqtt.ivu-software.de:443`

## 🚀 Schnellstart

### 1. Setup

```bash
npm install
```

### 2. Umgebungsvariable konfigurieren

```bash
cp .env.example .env
# Editiere .env und setze deine Telefonnummer:
# PHONE_NUMBER=+4940...
```

### 3. Erstes Test-Skript starten

```bash
npx tsx tests/01-say.ts
```

Der Test-Client verbindet sich automatisch mit `wss://mqtt.ivu-software.de:443` und weist deiner Telefonnummer eine Session zu. Rufe die Nummer an, um den Test zu starten!

## 📚 Workshop-Struktur

### Teil 1: API-Funktionen kennenlernen (90 min)

In diesem Teil lernen Sie alle Funktionen der IVU Voice API kennen. Jedes Test-Skript demonstriert eine spezifische Funktion:

#### Test 01: SAY - Text-to-Speech (10 min)
**Datei:** `tests/01-say.ts`

Lernen Sie:
- Verbindung zum Server aufbauen
- Telefonnummer zuweisen
- Text-to-Speech verwenden
- Anruf beenden

```bash
npx tsx tests/01-say.ts
```

#### Test 02: Collect Speech - Spracheingabe (15 min)
**Datei:** `tests/02-collect-speech.ts`

Lernen Sie:
- Spracheingabe sammeln (ASR)
- Spracherkennung konfigurieren
- Transkription verarbeiten

```bash
npx tsx tests/02-collect-speech.ts
```

#### Test 03: DTMF - Zifferneingabe (15 min)
**Datei:** `tests/03-dtmf.ts`

Lernen Sie:
- DTMF-Eingaben sammeln
- Menüs aufbauen
- Verzweigungslogik implementieren

```bash
npx tsx tests/03-dtmf.ts
```

#### Test 04: DTMF + Speech - Kombiniert (15 min)
**Datei:** `tests/04-dtmf-speech.ts`

Lernen Sie:
- DTMF und Sprache kombinieren
- Komplexe Flows gestalten

```bash
npx tsx tests/04-dtmf-speech.ts
```

#### Test 05: Announcement - Professionelle Ansagen (10 min)
**Datei:** `tests/05-announcement.ts`

Lernen Sie:
- Vorab aufgenommene Ansagen abspielen
- Audio-Dateien verwenden

```bash
npx tsx tests/05-announcement.ts
```

#### Test 06: Transfer - Anrufweiterleitung (15 min)
**Datei:** `tests/06-transfer.ts`

Lernen Sie:
- Anrufe zu SIP-Benutzern weiterleiten
- Anrufe zu Telefonnummern weiterleiten
- Sequential vs. Parallel Bridging

```bash
npx tsx tests/06-transfer.ts
```

#### Test 07: Record - Anrufaufzeichnung (10 min)
**Datei:** `tests/07-record.ts`

Lernen Sie:
- Anrufe aufzeichnen
- Aufzeichnungen abrufen
- Rechtliche Hinweise beachten

```bash
npx tsx tests/07-record.ts
```

#### Test 08: MakeCall - Ausgehende Anrufe (10 min)
**Datei:** `tests/08-makecall-REQUIRES-ACTIVATION.ts`

Lernen Sie:
- Ausgehende Anrufe initiieren
- Callback-Mechanismus verstehen

⚠️ **Hinweis:** Benötigt API-Aktivierung

```bash
npx tsx tests/08-makecall-REQUIRES-ACTIVATION.ts
```

#### Test 09: SendSMS - SMS versenden (5 min)
**Datei:** `tests/09-sendsms-REQUIRES-ACTIVATION.ts`

Lernen Sie:
- SMS programmatisch versenden

⚠️ **Hinweis:** Benötigt API-Aktivierung

```bash
npx tsx tests/09-sendsms-REQUIRES-ACTIVATION.ts
```

### Teil 2: Praxis-Projekt Zählerstandserfassung (120 min)

Im zweiten Teil bauen Sie einen vollständigen Voice-Bot zur Zählerstandserfassung. Das Projekt kombiniert alle gelernten Funktionen mit praktischen Anforderungen.

#### Projektziele

1. **Kundenvalidierung**
   - Kundennummer per Sprache erfassen
   - Gegen CSV-Datei validieren
   - Fehlerfälle behandeln

2. **Zählerstandserfassung**
   - Zählernummer validieren
   - Zählerstand per Sprache sammeln
   - Plausibilität prüfen

3. **Datenspeicherung**
   - Zählerstände in CSV speichern
   - Timestamps erfassen
   - Transkripte dokumentieren

4. **Fehlerbehandlung**
   - Ungültige Eingaben abfangen
   - Maximal 2 Wiederholungen
   - Freundliche Fehlermeldungen

#### Projekt-Struktur

```
workshop/
├── lib/
│   └── ivu-voice-client.ts      # IVU Voice Client SDK
│
├── data/
│   ├── customers.csv              # Kundendaten
│   ├── meter-readings.csv         # Zählerstände
│   └── transcripts/               # Gesprächsprotokolle
│
├── tests/                         # Teil 1: API-Tests
│   ├── 01-say.ts
│   ├── 02-collect-speech.ts
│   └── ...
│
├── src/                           # Teil 2: Projektcode
│   ├── meter-reading-bot.ts      # Haupt-Bot
│   ├── services/
│   │   ├── customer-lookup.ts    # CSV Validierung
│   │   ├── meter-validation.ts   # Zählerstand-Logik
│   │   └── csv-writer.ts         # Daten speichern
│   └── utils/
│       └── speech-parser.ts      # Sprache → Zahlen
│
├── .env                           # Konfiguration
├── package.json
└── README.md
```

#### Schritt-für-Schritt Anleitung

**Schritt 1: CSV-Daten vorbereiten (10 min)**

Erstellen Sie die Datei `data/customers.csv`:

```csv
customer_number,meter_number,customer_name
12345,M-789,Max Mustermann
67890,M-456,Erika Musterfrau
```

**Schritt 2: Customer Lookup Service (20 min)**

Implementieren Sie `src/services/customer-lookup.ts`:
- CSV-Datei einlesen
- Kundennummer suchen
- Zählernummer validieren

**Schritt 3: Sprach-Parser (20 min)**

Implementieren Sie `src/utils/speech-parser.ts`:
- Sprache zu Zahlen konvertieren
- Deutsche Zahlenworte verarbeiten
- Validierung durchführen

**Schritt 4: CSV Writer (15 min)**

Implementieren Sie `src/services/csv-writer.ts`:
- Neue Zählerstände anhängen
- Zeitstempel hinzufügen
- File-Locking beachten

**Schritt 5: Bot zusammenbauen (40 min)**

Implementieren Sie `src/meter-reading-bot.ts`:
- Call-Flow orchestrieren
- Services integrieren
- Fehlerbehandlung einbauen
- Freundliche Dialoge gestalten

**Schritt 6: Testing (15 min)**

```bash
npx tsx src/meter-reading-bot.ts
```

Testen Sie verschiedene Szenarien:
- ✅ Gültige Kundennummer
- ❌ Ungültige Kundennummer
- ✅ Gültiger Zählerstand
- ❌ Unplausible Werte
- 🔁 Wiederholungen bei Fehler

## 🗂️ Projekt-Struktur

```
workshop/
├── lib/                     # IVU Voice Client SDK
│   └── ivu-voice-client.ts
│
├── tests/                   # Teil 1: API-Tests
│   ├── 01-say.ts
│   ├── 02-collect-speech.ts
│   ├── 03-dtmf.ts
│   ├── 04-dtmf-speech.ts
│   ├── 05-announcement.ts
│   ├── 06-transfer.ts
│   ├── 07-record.ts
│   ├── 08-makecall-REQUIRES-ACTIVATION.ts
│   ├── 09-sendsms-REQUIRES-ACTIVATION.ts
│   └── README.md
│
├── src/                     # Teil 2: Projektcode
│   └── meter-reading-bot.ts
│
├── data/                    # CSV-Daten
│   ├── customers.csv
│   ├── meter-readings.csv
│   └── transcripts/
│
├── .env.example
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 API-Referenz

### Session erstellen

```typescript
import { createVoiceSession } from './lib/ivu-voice-client';

// Verbindet mit wss://mqtt.ivu-software.de:443
const session = await createVoiceSession();

// Telefonnummer zuweisen
await session.assignPhoneNumber(process.env.PHONE_NUMBER);
```

### Call-Events

```typescript
session.on('call.incoming', async (call) => {
  // Neuer eingehender Anruf
  console.log('Anruf empfangen:', call.callId);
});

session.on('call.ended', (callId) => {
  // Anruf wurde beendet
  console.log('Anruf beendet:', callId);
});

session.on('call.user_input', (input) => {
  // Benutzer-Eingabe erhalten
  console.log('Eingabe:', input);
});

session.on('error', (error) => {
  // Fehler aufgetreten
  console.error('Fehler:', error);
});
```

### Call-Actions

```typescript
// Text aussprechen (TTS)
await call.say('Willkommen!');

// Ziffern sammeln (DTMF)
const digits = await call.collectDigits({
  maxDigits: 5,
  timeout: 10  // Sekunden
});

// Sprache sammeln (ASR)
const speech = await call.collectSpeech({
  language: 'de-DE',
  timeout: 5,
  prompt: 'Bitte sprechen Sie jetzt'
});

// Ansage abspielen
await call.playAnnouncement('IVU_WELCOME');

// Anruf weiterleiten
await call.bridge('sipuser', {
  destinationType: 'SIP_USER',
  timeout: 30
});

// oder zu Telefonnummer
await call.bridge('+4940123456', {
  destinationType: 'PHONE_NUMBER',
  timeout: 30
});

// Anruf beenden
await call.hangup('Auf Wiedersehen!');
```

### Recording API

```typescript
// Aufzeichnung starten
const recording = await session.startRecording({
  callUuid: call.callUuid,
  recordCaller: true,
  recordCallee: true
});

// Aufzeichnung stoppen
await session.stopRecording({
  callUuid: call.callUuid,
  recordingUuid: recording.recordingUuid
});

// Aufzeichnung abrufen
const audio = await session.retrieveRecording({
  recordingUuid: recording.recordingUuid
});
```

### MakeCall API

```typescript
// Ausgehenden Anruf initiieren
const result = await session.makeCall({
  destinationNumber: '+491234567890',
  teniosNumber: process.env.PHONE_NUMBER,
  callerId: process.env.PHONE_NUMBER
});
```

## 🐛 Troubleshooting

### Problem: "FEHLER: PHONE_NUMBER Umgebungsvariable ist nicht gesetzt!"

**Lösung:**
1. Kopiere `.env.example` zu `.env`
2. Trage deine Telefonnummer ein: `PHONE_NUMBER=+4940...`
3. Starte das Skript neu

### Problem: "Nummer ist keiner Session zugewiesen"

**Lösung:**
1. Prüfe, ob `session.assignPhoneNumber()` aufgerufen wurde
2. Warte bis "Warte auf Anrufe..." angezeigt wird
3. Rufe dann die richtige Nummer an

### Problem: "Spracheingabe wird nicht erkannt"

**Lösung:**
1. Spreche klar und deutlich
2. Warte auf die Ansage, bevor du sprichst
3. Minimiere Hintergrundgeräusche
4. Verwende ein gutes Mikrofon

### Problem: "DTMF-Eingabe funktioniert nicht"

**Lösung:**
1. Drücke die Tasten fest
2. Warte auf den Piepton
3. Nutze das Telefon-Tastenfeld (nicht Smartphone-Display)

## 📖 Weiterführende Ressourcen

- **Tests-Dokumentation:** Siehe `tests/README.md`
- **IVU Voice API:** Dokumentation unter mqtt.ivu-software.de
- **TypeScript Handbook:** https://www.typescriptlang.org/docs

## 🤝 Support

Bei Fragen während des Workshops:

- **Workshop-Leiter fragen**
- **Dokumentation in `tests/README.md` lesen**
- **Test-Skripte als Beispiele verwenden**

## 📝 Lizenz

MIT License

---

**Viel Erfolg beim Workshop! 🎉**
