# IVU Voice API Referenz

## Übersicht
Die IVU Voice API ermöglicht die Entwicklung von Voice-Bots für Telefonanwendungen.

## Session-API

### createVoiceSession()
Erstellt eine neue Voice-Session.
```typescript
const session = await createVoiceSession();
```

### session.assignPhoneNumber(phoneNumber)
Weist eine Telefonnummer der Session zu.
```typescript
await session.assignPhoneNumber('+4940123456789');
```

### session.chat(options)
Sendet eine Nachricht an die KI und erhält eine Antwort.
```typescript
const result = await session.chat({
  userMessage: 'Wie ist das Wetter?',
  systemPrompt: 'Du bist ein freundlicher Assistent.',  // optional
  temperature: 0.7,  // optional, 0-1
  maxTokens: 150     // optional
});
console.log(result.aiResponse);
```

### session.stt(options)
Transkribiert Audio zu Text (Speech-to-Text).
```typescript
const result = await session.stt({
  audio: audioBuffer,      // Buffer mit Audio-Daten
  language: 'de-DE'        // optional, default: 'de-DE'
});
console.log(result.text);
```

### session.tts(options)
Wandelt Text in Audio um (Text-to-Speech).
```typescript
const result = await session.tts({
  text: 'Hallo Welt',
  voice: 'nova',        // optional: alloy, echo, fable, onyx, nova, shimmer
  language: 'de-DE',    // optional
  speed: 1.0            // optional: 0.25-4.0
});
// result.audio = Buffer mit MP3-Daten
```

### session.lookupCustomer(customerNumber)
Sucht einen Kunden in der CSV-Datei.
```typescript
const customer = await session.lookupCustomer('12345');
if (customer) {
  console.log(customer.customer_name);
}
```

### session.saveMeterReading(data)
Speichert einen Zählerstand in der CSV-Datei.
```typescript
await session.saveMeterReading({
  customerNumber: '12345',
  meterNumber: 'M-789',
  reading: 5432
});
```

## Call-Handle API

Bei eingehenden Anrufen wird ein `call`-Objekt übergeben:

```typescript
session.on('call.incoming', async (call) => {
  // call.callId - Eindeutige Anruf-ID
  // call.callUuid - UUID für Recording-API
});
```

### call.say(text)
Spricht Text zum Anrufer.
```typescript
await call.say('Willkommen bei unserem Service!');
```

### call.collectSpeech(options)
Sammelt Spracheingabe vom Anrufer.
```typescript
const speech = await call.collectSpeech({
  prompt: 'Bitte sagen Sie Ihren Namen.',  // optional
  timeout: 5  // optional, Sekunden
});
console.log('Gesagt:', speech);
```

### call.collectDigits(options)
Sammelt DTMF-Eingaben (Tastendruck).
```typescript
const digits = await call.collectDigits({
  maxDigits: 5,
  prompt: 'Bitte geben Sie Ihre Kundennummer ein.'  // optional
});
console.log('Eingabe:', digits);
```

### call.hangup(message?)
Beendet den Anruf.
```typescript
await call.hangup('Auf Wiederhören!');
```

### call.bridge(destination, options?)
Leitet den Anruf weiter.
```typescript
await call.bridge('support', {
  destinationType: 'SIP_USER',  // oder 'PHONE_NUMBER'
  timeout: 30
});
```

### call.playAnnouncement(name)
Spielt eine vordefinierte Ansage ab.
```typescript
await call.playAnnouncement('IVU_WELCOME');
```

## TTS Stimmen

| Stimme | Beschreibung |
|--------|-------------|
| alloy | Neutral, ausgewogen |
| echo | Warm, männlich |
| fable | Expressiv, britisch |
| onyx | Tief, autoritär |
| nova | Freundlich, weiblich (empfohlen) |
| shimmer | Sanft, klar |

## Beispiel: Einfacher Voice-Bot

```typescript
import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  const session = await createVoiceSession();
  await session.assignPhoneNumber(process.env.PHONE_NUMBER!);

  console.log('Warte auf Anrufe...');

  session.on('call.incoming', async (call) => {
    await call.say('Willkommen! Wie kann ich Ihnen helfen?');

    const speech = await call.collectSpeech({ timeout: 5 });

    const response = await session.chat({
      userMessage: speech,
      systemPrompt: 'Du bist ein hilfreicher Kundenservice-Bot.'
    });

    await call.say(response.aiResponse);
    await call.hangup('Auf Wiederhören!');
  });
}

main();
```
