/**
 * Test Client - Combined DTMF + Speech
 *
 * Tests both collectDigits (DTMF) and collectSpeech (ASR) in sequence
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Combined DTMF + Speech Test\n');
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
    console.log('🎉 Kombinierter Test-Client bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Willkommensnachricht');
    console.log('   2. DTMF-Menü (drücken Sie 1 für Deutsch oder 2 für Englisch)');
    console.log('   3. Spracheingabe (sagen Sie Ihren Namen)');
    console.log('   4. Bestätigung & Auflegen\n');
    console.log('⏳ Warte auf Anrufe...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starte kombinierten Test-Ablauf...\n');

        // Test 1: Say + collectDigits (DTMF)
        console.log('   [Test 1] DTMF-Eingabe...');
        await call.say('Willkommen zum kombinierten Test.');
        await call.say('Drücken Sie die 1 für Deutsch oder die 2 für Englisch.');

        const digits = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ Benutzer drückte:', digits);

        // Respond based on input
        if (digits === '1') {
          await call.say('Sie haben Deutsch gewählt.');
        } else if (digits === '2') {
          await call.say('You selected English.');
        } else {
          await call.say('Ungültige Eingabe.');
        }

        // Test 2: collectSpeech (ASR)
        console.log('   [Test 2] Spracherkennung...');
        await call.say('Bitte nennen Sie Ihren Namen.');

        const speech = await call.collectSpeech({
          language: 'de-DE',
          timeout: 10
        });

        console.log('   ✅ Benutzer sagte:', speech);

        // Respond with recognition result
        await call.say(`Vielen Dank, ${speech || 'unbekannter Name'}.`);

        // Test 3: Final message and hangup
        console.log('   [Test 3] Auflegen...');
        await call.say('Alle Tests erfolgreich abgeschlossen.');
        await call.hangup('Auf Wiedersehen!');

        console.log('\n✅ Alle Tests erfolgreich abgeschlossen!\n');
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
