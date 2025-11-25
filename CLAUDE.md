# IVU Voice API Workshop

## Projektübersicht
Voice-Bot Workshop mit der IVU Voice API. Teilnehmer lernen, Voice-Anwendungen zu entwickeln.

## Wichtige Dateien
- `lib/ivu-voice-client.ts` - IVU Voice Client SDK (NICHT ÄNDERN)
- `tests/` - Nummerierte Test-Skripte (01-13)
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
