# IVU Voice API Workshop

## Projektübersicht
Voice-Bot Workshop mit der IVU Voice API. Teilnehmer lernen, Voice-Anwendungen zu entwickeln.

## Wichtige Dateien
- `lib/ivu-voice-client.ts` - IVU Voice Client SDK (NICHT ÄNDERN)
- `tests/` - Nummerierte Test-Skripte (01-14)
- `workshop-data/` - CSV-Daten (customers.csv, meter-readings.csv)

## API-Kurzreferenz

### Session erstellen
```typescript
import { createVoiceSession } from './lib/ivu-voice-client';
const session = await createVoiceSession();
await session.assignPhoneNumber(process.env.PHONE_NUMBER);
```

### Session-Methoden
- `session.chat({ userMessage, systemPrompt?, temperature?, maxTokens? })` - KI-Chat
- `session.stt({ audio, language? })` - Speech-to-Text
- `session.tts({ text, voice?, language?, speed? })` - Text-to-Speech
- `session.lookupCustomer(customerNumber)` - Kunde in CSV suchen
- `session.saveMeterReading({ customerNumber, meterNumber, reading })` - Zählerstand speichern

### Call-Handle Methoden (bei eingehendem Anruf)
- `call.say(text)` - Text sprechen
- `call.prompt(text, { timeout? })` - Text sprechen UND Spracheingabe sammeln (EMPFOHLEN für mehrstufige Flows)
- `call.collectSpeech({ prompt?, timeout? })` - Spracheingabe sammeln
- `call.collectDigits({ maxDigits, prompt? })` - DTMF-Eingabe sammeln
- `call.hangup(message?)` - Anruf beenden

### Events
- `session.on('call.incoming', (call) => ...)` - Eingehender Anruf
- `session.on('call.ended', (callId) => ...)` - Anruf beendet

## Entwicklungsregeln
- Deutsche Sprache für Voice-Ausgaben
- Fehlerbehandlung mit try/catch
- process.exit(0) am Ende
- Niemals lib/ivu-voice-client.ts ändern

## Workshop-Aufgabe: Zählerstandserfassung

### Anforderungen
Erstelle `tests/14-meter-reading.ts` - einen Voice-Bot für Zählerstandserfassung:

1. **Kundennummer abfragen** → gegen `customers.csv` validieren
2. **Zählernummer abfragen** → muss zum Kunden passen
3. **Zählerstand abfragen** → Bestätigung (Ja/Nein) einholen
4. **Speichern** in `meter-readings.csv`

### Technische Hinweise
- Nutze `call.prompt()` für jeden Abfrageschritt (verhindert Race Conditions)
- Nutze `session.chat()` mit KI-Prompt um Zahlen aus Sprache zu extrahieren
- Maximal 3 Versuche pro Schritt
- Test-Kunden: 12345 (Zähler 789456), 23456 (Zähler 456123), 34567 (Zähler 123789)
