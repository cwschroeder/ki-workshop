/**
 * Beispiel 2: DTMF-Menü
 *
 * Interaktives Menü mit Zifferneingabe (DTMF - Dual-Tone Multi-Frequency).
 * Kunde kann mit Tastatur am Telefon Optionen wählen.
 *
 * Was Sie lernen:
 * - Ziffern sammeln (collectDigits)
 * - Verzweigungslogik (if/else)
 * - Mehrere Menüebenen
 * - Fehlerbehandlung bei ungültiger Eingabe
 */

import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🎯 Beispiel 2: DTMF-Menü');
  console.log('Starte Session...\n');

  const session = await createVoiceSession();

  session.on('call.incoming', async (call) => {
    console.log('📞 Anruf eingehend!');

    try {
      // Begrüßung
      await call.say('Willkommen beim Stadtwerk.');

      // Hauptmenü
      const choice = await call.collectDigits({
        maxDigits: 1,
        prompt: `Bitte wählen Sie:
          Drücken Sie 1 für Zählerstandsmeldung.
          Drücken Sie 2 um mit einem Mitarbeiter zu sprechen.
          Drücken Sie 3 für Öffnungszeiten.`,
        timeout: 10
      });

      console.log(`👤 Kunde wählte: ${choice}`);

      // Verzweigung basierend auf Auswahl
      if (choice === '1') {
        await call.say('Sie haben Zählerstandsmeldung gewählt.');
        await call.say('Diese Funktion wird in Beispiel 5 implementiert.');
        await call.hangup('Vielen Dank. Auf Wiedersehen!');
      } else if (choice === '2') {
        await call.say('Einen Moment bitte. Ich verbinde Sie mit einem Mitarbeiter.');
        // In Produktion: await call.transfer('sip:agent@tenios.com');
        await call.say('Die Weiterleitung ist in diesem Demo deaktiviert.');
        await call.hangup('Auf Wiedersehen!');
      } else if (choice === '3') {
        await call.say(`Unsere Öffnungszeiten:
          Montag bis Freitag von 9 bis 18 Uhr.
          Samstag von 10 bis 14 Uhr.`);
        await call.hangup('Vielen Dank für Ihren Anruf!');
      } else {
        // Ungültige Eingabe
        await call.say('Ungültige Eingabe.');
        await call.hangup('Bitte versuchen Sie es erneut. Auf Wiedersehen!');
      }

      console.log('✅ Anruf beendet');
    } catch (error) {
      console.error('❌ Fehler:', error);
      await call.hangup('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.');
    }
  });

  session.on('call.ended', (callId) => {
    console.log(`📵 Anruf ${callId} beendet`);
  });

  await session.start();

  console.log('✅ Session gestartet');
  console.log('💡 Rufen Sie an und drücken Sie 1, 2 oder 3!\n');
  console.log('Drücken Sie Ctrl+C zum Beenden');
}

main().catch(console.error);

/**
 * AUFGABEN:
 * 1. Fügen Sie eine vierte Menüoption hinzu (z.B. Störungsmeldung)
 * 2. Implementieren Sie ein Untermenü für Option 1
 * 3. Was passiert, wenn der Kunde nichts drückt (Timeout)?
 * 4. Wie würden Sie eine "Zurück"-Option implementieren?
 */
