# IVU Voice API Tests

Nummerierte Test-Skripte für die IVU Voice API. Jeder Test demonstriert verschiedene Features der API.

## 📋 Voraussetzungen

1. **Umgebungsvariable setzen**: Kopiere `.env.example` zu `.env` und trage deine Telefonnummer ein:

   **macOS/Linux:**
   ```bash
   cp .env.example .env
   ```

   **Windows:**
   ```cmd
   copy .env.example .env
   ```

   Editiere `.env` und setze: `PHONE_NUMBER=+49...`

2. **Dependencies installieren**:
   ```bash
   npm install
   ```

3. **Server läuft**: Der IVU Voice API Server muss erreichbar sein (`mqtt.ivu-software.de:443`)

## 🧪 Tests

### Test 01: SAY - Text-to-Speech (10 min)
```bash
npx tsx tests/01-say.ts
```

**Was Sie lernen:**
- Verbindung zum Server aufbauen
- Telefonnummer zuweisen
- Text-to-Speech verwenden
- Anruf beenden

**Erwartetes Ergebnis:**
Sie hören drei TTS-Ansagen nacheinander, dann wird aufgelegt.

---

### Test 02: Collect Speech - Spracheingabe (15 min)
```bash
npx tsx tests/02-collect-speech.ts
```

**Was Sie lernen:**
- Spracheingabe sammeln (ASR)
- Spracherkennung konfigurieren
- Transkription verarbeiten

**Erwartetes Ergebnis:**
Bot fragt nach Ihrem Namen, Sie sprechen ihn, Bot wiederholt ihn.

---

### Test 03: DTMF - Zifferneingabe (15 min)
```bash
npx tsx tests/03-dtmf.ts
```

**Was Sie lernen:**
- DTMF-Eingaben sammeln
- Menüs aufbauen
- Verzweigungslogik implementieren

**Erwartetes Ergebnis:**
Menü mit 3 Optionen (drücken Sie 1, 2 oder 3), verschiedene Antworten je nach Wahl.

---

### Test 04: DTMF + Speech - Kombiniert (15 min)
```bash
npx tsx tests/04-dtmf-speech.ts
```

**Was Sie lernen:**
- DTMF und Sprache kombinieren
- Komplexe Flows gestalten

**Erwartetes Ergebnis:**
Wahl zwischen DTMF-Eingabe (drücken Sie eine Taste) oder Spracheingabe (sprechen Sie).

---

### Test 05: Announcement - Professionelle Ansagen (10 min)
```bash
npx tsx tests/05-announcement.ts
```

**Was Sie lernen:**
- Vorab aufgenommene Ansagen abspielen
- Audio-Dateien verwenden

**Erwartetes Ergebnis:**
Professionelle Sprachaufnahme wird abgespielt (keine TTS-Stimme).

---

### Test 06: Transfer - Anrufweiterleitung (15 min)
```bash
npx tsx tests/06-transfer.ts
```

**Was Sie lernen:**
- Anrufe zu SIP-Benutzern weiterleiten
- Anrufe zu Telefonnummern weiterleiten
- Sequential vs. Parallel Bridging

**Erwartetes Ergebnis:**
Anruf wird weitergeleitet (je nach Konfiguration an SIP-User oder Telefonnummer).

---

### Test 07: Record - Anrufaufzeichnung (10 min)
```bash
npx tsx tests/07-record.ts
```

**Was Sie lernen:**
- Anrufe aufzeichnen
- Aufzeichnungen abrufen
- Rechtliche Hinweise beachten

**Erwartetes Ergebnis:**
Bot zeichnet auf, Sie sprechen etwas, Aufzeichnung wird heruntergeladen.

---

### Test 08: MakeCall - Ausgehende Anrufe ⚠️ REQUIRES ACTIVATION (10 min)
```bash
npx tsx tests/08-makecall-REQUIRES-ACTIVATION.ts
```

**Was Sie lernen:**
- Ausgehende Anrufe initiieren
- Callback-Mechanismus verstehen

**Erwartetes Ergebnis:**
Bot ruft eine Zielnummer an. Wenn diese abnimmt, wird Ihre Nummer angerufen und beide werden verbunden.

⚠️ **Hinweis:** Benötigt MakeCall API-Aktivierung bei IVU Voice API Support.

---

### Test 09: SendSMS - SMS versenden ⚠️ REQUIRES ACTIVATION (5 min)
```bash
npx tsx tests/09-sendsms-REQUIRES-ACTIVATION.ts
```

**Was Sie lernen:**
- SMS programmatisch versenden

**Erwartetes Ergebnis:**
Eine Test-SMS wird an die konfigurierte Nummer gesendet.

⚠️ **Hinweis:** Benötigt SMS API-Aktivierung bei IVU Voice API Support.

---

## 💡 Tipps

- **Paralleltests**: Jeder Teilnehmer kann seine eigene `.env` mit unterschiedlicher `PHONE_NUMBER` haben
- **Ctrl+C**: Beendet den Test-Client sauber
- **Logs**: Zeigen den kompletten Ablauf inkl. Server-Events und Call-IDs
- **Wiederholungen**: Sie können jeden Test mehrmals ausführen, der Client bleibt aktiv
- **Debugging**: Bei Problemen zeigen die Logs exakte Fehler mit Zeitstempeln

## 🐛 Häufige Probleme

### "PHONE_NUMBER Umgebungsvariable ist nicht gesetzt"
**Lösung:** Erstellen Sie die `.env` Datei und setzen Sie `PHONE_NUMBER=+49...`

### "Keine Verbindung zum Server"
**Lösung:** Prüfen Sie, ob `mqtt.ivu-software.de:443` erreichbar ist

### "Sprache wird nicht erkannt"
**Lösung:** Sprechen Sie klar und deutlich, warten Sie auf die Ansage, minimieren Sie Hintergrundgeräusche

### "DTMF funktioniert nicht"
**Lösung:** Drücken Sie die Tasten fest, nutzen Sie das Telefon-Tastenfeld (nicht Smartphone-Display)
