/**
 * Test 14 - Zählerstandserfassung Voice Bot
 *
 * Vollständiger Flow:
 * 1. Kunde ruft an
 * 2. Kundennummer per Sprache abfragen → gegen customers.csv validieren
 * 3. Zählernummer abfragen → validieren (muss zum Kunden passen)
 * 4. Zählerstand abfragen → bestätigen lassen (Ja/Nein)
 * 5. In meter-readings.csv speichern
 */

import 'dotenv/config';
import { createVoiceSession, CallHandle, VoiceSession } from './lib/ivu-voice-client';

// Prompt für KI-Extraktion von Zahlen aus Sprache
const NUMBER_EXTRACTION_PROMPT = `Du bist ein Assistent der Zahlen aus gesprochener Sprache extrahiert.
Extrahiere NUR die Zahl(en) aus dem Text. Gib nur die Ziffern zurück, keine Wörter.
Beispiele:
- "meine Kundennummer ist eins zwei drei vier fünf" → "12345"
- "die Zählernummer lautet sieben acht neun vier fünf sechs" → "789456"
- "der Stand ist fünftausend vierhundertzweiunddreißig" → "5432"
- "zwölftausenddreihundertvierzig" → "12340"
- "ich sage mal 9 8 7 6" → "9876"

Antworte NUR mit den Ziffern, ohne weitere Erklärung.`;

const CONFIRMATION_PROMPT = `Du analysierst ob eine Antwort eine Bestätigung (Ja) oder Ablehnung (Nein) ist.
Antworte nur mit "JA" oder "NEIN".
Beispiele:
- "ja genau" → JA
- "das stimmt" → JA
- "korrekt" → JA
- "nein" → NEIN
- "das ist falsch" → NEIN
- "ne stimmt nicht" → NEIN`;

async function extractNumber(session: VoiceSession, spokenText: string): Promise<string | null> {
  try {
    const result = await session.chat({
      userMessage: spokenText,
      systemPrompt: NUMBER_EXTRACTION_PROMPT,
      temperature: 0.1
    });
    const extracted = result.aiResponse.trim().replace(/\D/g, '');
    console.log(`   🔢 Extrahiert: "${spokenText}" → "${extracted}"`);
    return extracted || null;
  } catch (error) {
    console.error('   ❌ Fehler bei Zahlenextraktion:', error);
    return null;
  }
}

async function isConfirmation(session: VoiceSession, spokenText: string): Promise<boolean> {
  try {
    const result = await session.chat({
      userMessage: spokenText,
      systemPrompt: CONFIRMATION_PROMPT,
      temperature: 0.1
    });
    const answer = result.aiResponse.trim().toUpperCase();
    console.log(`   ✅ Bestätigung: "${spokenText}" → "${answer}"`);
    return answer.includes('JA');
  } catch (error) {
    console.error('   ❌ Fehler bei Bestätigungsanalyse:', error);
    return false;
  }
}

async function handleCall(session: VoiceSession, call: CallHandle) {
  console.log('\n' + '='.repeat(60));
  console.log('📞 Neuer Anruf - Zählerstandserfassung');
  console.log('='.repeat(60));

  try {
    // Begrüßung
    await call.say('Willkommen bei der automatischen Zählerstandserfassung.');
    await call.say('Ich werde Sie durch den Prozess führen.');

    // --- SCHRITT 1: Kundennummer abfragen ---
    let customer = null;
    let customerNumber = '';
    let attempts = 0;
    const maxAttempts = 3;

    while (!customer && attempts < maxAttempts) {
      attempts++;
      console.log(`\n📋 Schritt 1: Kundennummer abfragen (Versuch ${attempts}/${maxAttempts})`);

      const customerInput = await call.prompt(
        'Bitte nennen Sie Ihre Kundennummer.',
        { timeout: 10 }
      );
      console.log(`   💬 Eingabe: "${customerInput}"`);

      customerNumber = await extractNumber(session, customerInput) || '';

      if (customerNumber) {
        customer = await session.lookupCustomer(customerNumber);
        if (customer) {
          console.log(`   ✅ Kunde gefunden: ${customer.customer_name}`);
          await call.say(`Vielen Dank, ${customer.customer_name}. Ich habe Sie gefunden.`);
        } else {
          console.log(`   ⚠️ Kunde nicht gefunden: ${customerNumber}`);
          await call.say(`Die Kundennummer ${customerNumber} wurde nicht gefunden.`);
        }
      } else {
        console.log(`   ⚠️ Keine Kundennummer erkannt`);
        await call.say('Ich konnte keine Kundennummer erkennen.');
      }
    }

    if (!customer) {
      await call.say('Leider konnte ich Ihre Kundennummer nicht verifizieren.');
      await call.hangup('Bitte rufen Sie erneut an oder kontaktieren Sie unseren Kundenservice.');
      return;
    }

    // --- SCHRITT 2: Zählernummer abfragen ---
    let meterNumber = '';
    let meterValid = false;
    attempts = 0;

    while (!meterValid && attempts < maxAttempts) {
      attempts++;
      console.log(`\n📋 Schritt 2: Zählernummer abfragen (Versuch ${attempts}/${maxAttempts})`);

      const meterInput = await call.prompt(
        'Bitte nennen Sie Ihre Zählernummer.',
        { timeout: 10 }
      );
      console.log(`   💬 Eingabe: "${meterInput}"`);

      meterNumber = await extractNumber(session, meterInput) || '';

      if (meterNumber) {
        // Validierung: Zählernummer muss zum Kunden passen
        if (meterNumber === customer.meter_number) {
          meterValid = true;
          console.log(`   ✅ Zählernummer korrekt: ${meterNumber}`);
          await call.say(`Die Zählernummer ${meterNumber} ist korrekt.`);
        } else {
          console.log(`   ⚠️ Zählernummer falsch: ${meterNumber} (erwartet: ${customer.meter_number})`);
          await call.say(`Die Zählernummer ${meterNumber} gehört nicht zu Ihrem Konto.`);
        }
      } else {
        console.log(`   ⚠️ Keine Zählernummer erkannt`);
        await call.say('Ich konnte keine Zählernummer erkennen.');
      }
    }

    if (!meterValid) {
      await call.say('Leider konnte ich Ihre Zählernummer nicht verifizieren.');
      await call.hangup('Bitte rufen Sie erneut an oder kontaktieren Sie unseren Kundenservice.');
      return;
    }

    // --- SCHRITT 3: Zählerstand abfragen ---
    let reading = 0;
    let readingConfirmed = false;
    attempts = 0;

    while (!readingConfirmed && attempts < maxAttempts) {
      attempts++;
      console.log(`\n📋 Schritt 3: Zählerstand abfragen (Versuch ${attempts}/${maxAttempts})`);

      const readingInput = await call.prompt(
        'Bitte nennen Sie Ihren aktuellen Zählerstand.',
        { timeout: 10 }
      );
      console.log(`   💬 Eingabe: "${readingInput}"`);

      const readingStr = await extractNumber(session, readingInput);

      if (readingStr) {
        reading = parseInt(readingStr, 10);
        console.log(`   🔢 Zählerstand erkannt: ${reading}`);

        // Bestätigung abfragen
        const confirmInput = await call.prompt(
          `Ich habe ${reading} verstanden. Ist das korrekt? Bitte sagen Sie Ja oder Nein.`,
          { timeout: 10 }
        );
        console.log(`   💬 Bestätigung: "${confirmInput}"`);

        readingConfirmed = await isConfirmation(session, confirmInput);

        if (readingConfirmed) {
          console.log(`   ✅ Zählerstand bestätigt: ${reading}`);
        } else {
          console.log(`   ⚠️ Zählerstand nicht bestätigt`);
          await call.say('Okay, versuchen wir es noch einmal.');
        }
      } else {
        console.log(`   ⚠️ Kein Zählerstand erkannt`);
        await call.say('Ich konnte keinen Zählerstand erkennen.');
      }
    }

    if (!readingConfirmed) {
      await call.say('Leider konnte ich Ihren Zählerstand nicht erfassen.');
      await call.hangup('Bitte rufen Sie erneut an.');
      return;
    }

    // --- SCHRITT 4: Speichern ---
    console.log('\n📋 Schritt 4: Zählerstand speichern');
    await session.saveMeterReading({
      customerNumber,
      meterNumber,
      reading
    });

    console.log(`   ✅ Gespeichert: Kunde ${customerNumber}, Zähler ${meterNumber}, Stand ${reading}`);

    // Erfolgreicher Abschluss
    await call.say(`Vielen Dank! Ihr Zählerstand von ${reading} wurde erfolgreich gespeichert.`);
    await call.say(`Zusammenfassung: Kunde ${customer.customer_name}, Zähler ${meterNumber}, Stand ${reading}.`);
    await call.hangup('Auf Wiederhören!');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Zählerstandserfassung erfolgreich abgeschlossen!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Fehler bei der Anrufbehandlung:', error);
    try {
      await call.hangup('Ein technischer Fehler ist aufgetreten. Bitte rufen Sie erneut an.');
    } catch {
      // Ignorieren wenn hangup fehlschlägt
    }
  }
}

async function main() {
  console.log('🧪 IVU Voice API - Zählerstandserfassung Test\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession();
    console.log('✅ Verbunden mit IVU Voice API Server');

    const phoneNumber = process.env.PHONE_NUMBER;
    if (!phoneNumber) {
      console.error('❌ FEHLER: PHONE_NUMBER Umgebungsvariable ist nicht gesetzt!');
      console.error('');
      console.error('Bitte setzen Sie Ihre Telefonnummer:');
      console.error('  1. Kopieren Sie .env.example nach .env');
      console.error('  2. Bearbeiten Sie .env und setzen Sie PHONE_NUMBER=+49...');
      process.exit(1);
    }

    await session.assignPhoneNumber(phoneNumber);
    console.log('✅ Telefonnummer zugewiesen:', phoneNumber);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Zählerstandserfassung Bot bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Kundennummer nennen (z.B. "eins zwei drei vier fünf")');
    console.log('   2. Zählernummer nennen (z.B. "sieben acht neun vier fünf sechs")');
    console.log('   3. Zählerstand nennen (z.B. "fünftausend")');
    console.log('   4. Mit "Ja" bestätigen');
    console.log('\n📊 Verfügbare Test-Kunden:');
    console.log('   - 12345 → Zähler 789456 (Max Mustermann)');
    console.log('   - 23456 → Zähler 456123 (Anna Schmidt)');
    console.log('   - 34567 → Zähler 123789 (Peter Müller)');
    console.log('\n⏳ Warte auf Anrufe...\n');

    session.on('call.incoming', (call) => handleCall(session, call));

    session.on('call.ended', (callId) => {
      console.log('📵 Anruf beendet:', callId);
      console.log('⏳ Warte auf nächsten Anruf...\n');
    });

    session.on('error', (error) => {
      console.error('\n❌ Session-Fehler:', error);
    });

    // Keep alive
    process.on('SIGINT', () => {
      console.log('\n\n👋 Fahre herunter...');
      session.stop();
      console.log('✅ Verbindung getrennt');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Schwerwiegender Fehler:', error);
    process.exit(1);
  }
}

main();
