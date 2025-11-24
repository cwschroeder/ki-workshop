# Workshop Challenge: Zählerstand-Bot

## Aufgabe

Baut mit Claude Code einen Voice-Bot zur Zählerstandserfassung.

**Zeit:** 20 Minuten

---

## Prompt für Claude Code

Kopiere diesen Prompt in Claude Code:

```
Lies die Dateien:
- lib/ivu-voice-client.ts (SDK)
- tests/10-chat-api.ts (Beispiel für chat() API)
- workshop-data/customers.csv (Kundendaten)

Erstelle einen Bot in src/meter-reading-bot.ts der:
1. Den Anrufer begrüßt
2. Nach der Kundennummer fragt und gegen customers.csv validiert
3. Nach der Zählernummer fragt und prüft ob sie zum Kunden passt
4. Den Zählerstand per Sprache abfragt
5. Die Eingabe bestätigt und in meter-readings.csv speichert
6. Sich verabschiedet

Nutze die chat() API für KI-gestützte Dialoge.
```

---

## Testen

```bash
npx tsx src/meter-reading-bot.ts
```

Dann die zugewiesene Nummer anrufen.

---

## Ablauf des Bots

```
📞 Anruf kommt rein
    ↓
🎙️ "Willkommen beim Zählerstand-Service"
    ↓
🎙️ "Bitte nennen Sie Ihre Kundennummer"
    ↓
👂 Kunde sagt: "zwölf drei vier fünf"
    ↓
🔍 Prüfe gegen customers.csv → Kunde gefunden!
    ↓
🎙️ "Guten Tag, Herr Mustermann. Bitte nennen Sie Ihre Zählernummer"
    ↓
👂 Kunde sagt: "sieben acht neun vier fünf sechs"
    ↓
🔍 Prüfe ob 789456 zum Kunden 12345 passt → Stimmt!
    ↓
🎙️ "Bitte nennen Sie Ihren aktuellen Zählerstand"
    ↓
👂 Kunde sagt: "fünf vier drei zwei eins"
    ↓
💾 Speichere in meter-readings.csv
    ↓
🎙️ "Vielen Dank. Ihr Zählerstand 54321 wurde gespeichert. Auf Wiedersehen!"
    ↓
📵 Auflegen
```

---

## Bonus-Aufgaben

Wenn ihr früher fertig seid:

- [ ] Maximal 2 Wiederholungen bei Fehleingaben
- [ ] Plausibilitätsprüfung des Zählerstands (nicht negativ, nicht zu hoch)
- [ ] SMS-Bestätigung an den Kunden senden

---

## Hilfreiche SDK-Funktionen

```typescript
// Kunde in CSV suchen
const customer = await session.lookupCustomer('12345');
// → { customer_number: '12345', meter_number: '789456', customer_name: 'Max Mustermann' }

// Zählerstand speichern
await session.saveMeterReading({
  customerNumber: '12345',
  meterNumber: '789456',
  reading: 54321
});

// KI-Chat mit Spracheingabe
const response = await call.chat({
  collectSpeech: true,
  systemPrompt: 'Frage nach der Kundennummer...',
  validation: {
    type: 'number',
    min: 10000,
    max: 99999
  }
});
```

---

## Test-Kundennummern

| Kundennummer | Name | Zählernummer |
|--------------|------|--------------|
| 12345 | Max Mustermann | 789456 |
| 23456 | Anna Schmidt | 456123 |
| 34567 | Peter Müller | 123789 |
| 45678 | Maria Weber | 999888 |
| 56789 | Thomas Fischer | 777666 |

---

Viel Erfolg! 🚀
