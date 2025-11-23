/**
 * Beispiel 3: Spracheingabe (ASR)
 *
 * Automatische Spracherkennung (ASR - Automatic Speech Recognition).
 * Kunde kann sprechen statt Tasten zu drücken.
 *
 * Was Sie lernen:
 * - Sprache aufnehmen (collectSpeech)
 * - Transkription verarbeiten
 * - Zahlen aus Text extrahieren
 * - Hybrid-Eingabe (Sprache + DTMF)
 */

import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🎯 Beispiel 3: Spracheingabe');
  console.log('Starte Session...\n');

  const session = await createVoiceSession();

  session.on('call.incoming', async (call) => {
    console.log('📞 Anruf eingehend!');

    try {
      // Begrüßung
      await call.say('Willkommen beim Stadtwerk Sprach-Test.');

      // Einfache Spracheingabe
      await call.say('Ich werde Ihnen jetzt einige Fragen stellen.');

      // Frage 1: Name
      const name = await call.collectSpeech({
        prompt: 'Wie ist Ihr Name?',
        language: 'de-DE',
        timeout: 10
      });

      console.log(`👤 Name: ${name}`);
      await call.say(`Guten Tag, ${name}.`);

      // Frage 2: Kundennummer (Zahlen)
      const customerNumber = await call.collectSpeech({
        prompt: 'Bitte nennen Sie Ihre Kundennummer.',
        language: 'de-DE',
        timeout: 10
      });

      console.log(`🔢 Kundennummer (roh): ${customerNumber}`);

      // Zahlen extrahieren (KI-basiert)
      const extracted = await call.extractCustomerInfo(customerNumber);
      console.log(`🔢 Extrahiert:`, extracted);

      if (extracted.customerNumber) {
        await call.say(`Vielen Dank. Ihre Kundennummer ist ${extracted.customerNumber}.`);
      } else {
        await call.say('Ich konnte die Kundennummer leider nicht verstehen.');
      }

      // Frage 3: Ja/Nein
      const confirm = await call.collectSpeech({
        prompt: 'Ist das korrekt? Sagen Sie Ja oder Nein.',
        language: 'de-DE',
        timeout: 5
      });

      console.log(`✅ Bestätigung: ${confirm}`);

      if (confirm.toLowerCase().includes('ja')) {
        await call.say('Perfekt! Vielen Dank.');
      } else {
        await call.say('Schade. Bitte versuchen Sie es erneut.');
      }

      await call.hangup('Auf Wiedersehen!');

      console.log('✅ Anruf beendet');
    } catch (error) {
      console.error('❌ Fehler:', error);
      await call.hangup('Es ist ein Fehler aufgetreten.');
    }
  });

  session.on('call.ended', (callId) => {
    console.log(`📵 Anruf ${callId} beendet`);
  });

  await session.start();

  console.log('✅ Session gestartet');
  console.log('💡 Rufen Sie an und sprechen Sie mit dem System!\n');
  console.log('Tipps:');
  console.log('- Sprechen Sie klar und deutlich');
  console.log('- Zahlen einzeln oder als Ganzes');
  console.log('- Bei "Ja/Nein" klar antworten\n');
  console.log('Drücken Sie Ctrl+C zum Beenden');
}

main().catch(console.error);

/**
 * AUFGABEN:
 * 1. Fügen Sie eine Adress-Abfrage hinzu (mehrere Wörter)
 * 2. Implementieren Sie eine Retry-Logik bei unklarer Eingabe
 * 3. Testen Sie verschiedene Zahleneingaben:
 *    - "eins zwei drei vier fünf"
 *    - "12345"
 *    - "zwölf tausend dreihundert fünfundvierzig"
 * 4. Was passiert bei Hintergrundgeräuschen?
 */
