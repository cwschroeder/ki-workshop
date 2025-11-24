# IVU Voice API Tests

Nummerierte Test-Skripte für die IVU Voice API. Jeder Test demonstriert verschiedene Features der API.

## Voraussetzungen

1. **Umgebungsvariable setzen**: Kopiere `.env.example` zu `.env` und trage deine Telefonnummer ein:
   ```bash
   cp .env.example .env
   # Editiere .env und setze: PHONE_NUMBER=+49...
   ```

2. **Server läuft**: Der IVU Voice API Server muss erreichbar sein (mqtt.ivu-software.de:443)

## Tests

### 01 - SAY (Text-to-Speech)
```bash
npx tsx tests/01-say.ts
```
Einfacher Test: Spielt eine TTS-Ansage ab und legt auf.

### 02 - Collect Speech (Spracheingabe)
```bash
npx tsx tests/02-collect-speech.ts
```
Fragt nach deinem Namen per Spracheingabe und wiederholt ihn.

### 03 - DTMF (Zifferneingabe)
```bash
npx tsx tests/03-dtmf.ts
```
Menü mit Zifferneingabe (drücke 1-3).

### 04 - DTMF + Speech (Kombiniert)
```bash
npx tsx tests/04-dtmf-speech.ts
```
Kombiniert DTMF und Spracheingabe.

### 05 - Announcement (Professionelle Ansagen)
```bash
npx tsx tests/05-announcement.ts
```
Spielt professionelle Sprachaufnahmen ab.

### 06 - Transfer (Anrufweiterleitung)
```bash
npx tsx tests/06-transfer.ts
```
Leitet den Anruf an SIP-User oder Telefonnummer weiter.

### 07 - Record (Aufnahme)
```bash
npx tsx tests/07-record.ts
```
Zeichnet den Anruf auf und lädt die Aufnahme herunter.

### 08 - MakeCall (Ausgehende Anrufe) ⚠️ REQUIRES ACTIVATION
```bash
npx tsx tests/08-makecall-REQUIRES-ACTIVATION.ts
```
Initiiert ausgehende Anrufe (benötigt API-Aktivierung).

### 09 - SendSMS ⚠️ REQUIRES ACTIVATION
```bash
npx tsx tests/09-sendsms-REQUIRES-ACTIVATION.ts
```
Versendet SMS (benötigt API-Aktivierung).

## Tipps

- **Paralleltests**: Jeder Teilnehmer kann seine eigene `.env` mit unterschiedlicher PHONE_NUMBER haben
- **Ctrl+C**: Beendet den Test-Client
- **Logs**: Zeigen den kompletten Ablauf inkl. Server-Events
