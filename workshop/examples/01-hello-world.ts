/**
 * Beispiel 1: Hello World
 *
 * Ihr erster Voice-Call mit der IVU Voice API.
 * Der einfachste mögliche Anruf: Begrüßung und Auflegen.
 *
 * Was Sie lernen:
 * - Session erstellen
 * - Call-Events behandeln
 * - Text aussprechen (say)
 * - Anruf beenden (hangup)
 */

import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🎯 Beispiel 1: Hello World');
  console.log('Starte Session...\n');

  // Session erstellen (verbindet mit IVU Voice API Server)
  const session = await createVoiceSession();

  // Event: Eingehender Anruf
  session.on('call.incoming', async (call) => {
    console.log('📞 Anruf eingehend!');

    try {
      // Begrüßung aussprechen
      await call.say('Willkommen beim IVU Voice API Workshop! Dies ist Ihr erster Anruf.');

      // Freundlich verabschieden und auflegen
      await call.hangup('Auf Wiedersehen!');

      console.log('✅ Anruf erfolgreich beendet');
    } catch (error) {
      console.error('❌ Fehler:', error);
    }
  });

  // Event: Anruf beendet
  session.on('call.ended', (callId) => {
    console.log(`📵 Anruf ${callId} beendet`);
  });

  // Event: Fehler
  session.on('error', (error) => {
    console.error('❌ Session-Fehler:', error);
  });

  // Session starten
  await session.start();

  console.log('✅ Session gestartet');
  console.log('💡 Rufen Sie jetzt Ihre TENIOS-Nummer an!\n');
  console.log('Drücken Sie Ctrl+C zum Beenden');
}

main().catch(console.error);

/**
 * AUFGABE:
 * - Ändern Sie den Begrüßungstext
 * - Testen Sie den Anruf
 * - Was passiert, wenn Sie vergessen hangup() aufzurufen?
 */
