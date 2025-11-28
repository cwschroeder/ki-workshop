/**
 * Test Client - Speech Recognition Only
 *
 * Tests collectSpeech (ASR) without COLLECT_DIGITS
 */

import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Speech Recognition Test\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession({
      // serverUrl is used from lib/ivu-voice-client.ts default: wss://mqtt.ivu-software.de:443
    });

    console.log('✅ Verbunden mit IVU Voice API Server');

    const phoneNumber = process.env.PHONE_NUMBER;
    if (!phoneNumber) {
      console.error('❌ FEHLER: PHONE_NUMBER Umgebungsvariable ist nicht gesetzt!');
      console.error('');
      console.error('Bitte setzen Sie Ihre Telefonnummer:');
      console.error('  1. Kopieren Sie .env.example nach .env');
      console.error('  2. Bearbeiten Sie .env und setzen Sie PHONE_NUMBER=+49...');
      console.error('  3. Führen Sie das Skript erneut aus');
      console.error('');
      process.exit(1);
    }

    await session.assignPhoneNumber(phoneNumber);
    console.log('✅ Telefonnummer zugewiesen:', phoneNumber);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Sprach-Test-Client bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Willkommensnachricht');
    console.log('   2. Spracheingabe (sagen Sie Ihren Namen)');
    console.log('   3. Bestätigung & Auflegen\n');
    console.log('⏳ Warte auf Anrufe...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starte Sprach-Test...\n');

        // Test: Say + collectSpeech (ASR)
        console.log('   [Test] Spracherkennung...');
        await call.say('Willkommen zum Sprach-Test.');
        await call.say('Bitte nennen Sie Ihren Namen.');

        const speech = await call.collectSpeech({
          language: 'de-DE',       // Required: Language code (e.g., 'de-DE', 'en-US')
          timeout: 5              // Optional: Timeout in seconds (default: 10)
          // maxTries: 2,          // Optional: Maximum number of tries (default: 2)
          // prompt: 'Sprechen Sie jetzt'  // Optional: Custom prompt text
        });

        console.log('   ✅ Benutzer sagte:', speech);

        // Respond with recognition result
        await call.say(`Vielen Dank, ${speech || 'unbekannter Name'}.`);
        await call.say('Test erfolgreich abgeschlossen.');
        await call.hangup('Auf Wiedersehen!');

        console.log('\n✅ Test erfolgreich abgeschlossen!\n');
        console.log('='.repeat(60));
        console.log('💡 Rufen Sie erneut an oder drücken Sie Ctrl+C zum Beenden');
        console.log('='.repeat(60) + '\n');

      } catch (error) {
        console.error('\n❌ Fehler während des Tests:');
        console.error(error);
        console.log('');
      }
    });

    // User input handler
    session.on('call.user_input', (input) => {
      console.log('💬 Benutzereingabe erhalten:', input);
    });

    // Call ended handler
    session.on('call.ended', (callId) => {
      console.log('📵 Anruf beendet:', callId);
      console.log('⏳ Warte auf nächsten Anruf...\n');
    });

    // Error handler
    session.on('error', (error) => {
      console.error('\n❌ Session-Fehler:');
      console.error(error);
      console.log('');
    });

    // Keep alive
    process.on('SIGINT', () => {
      console.log('\n\n👋 Fahre herunter...');
      session.stop();
      console.log('✅ Verbindung getrennt');
      console.log('Auf Wiedersehen!\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Schwerwiegender Fehler:');
    console.error(error);
    process.exit(1);
  }
}

main();
