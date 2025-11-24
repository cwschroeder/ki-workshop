/**
 * Test Client - DTMF (Digit Collection) Only
 *
 * Tests collectDigits with different announcements based on user choice
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - DTMF Test\n');
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
    console.log('🎉 DTMF-Test-Client bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Willkommensnachricht');
    console.log('   2. Aufforderung 1 (Deutsch) oder 2 (Englisch) zu drücken');
    console.log('   3. DTMF-Eingabe mit sprachspezifischer Ansage');
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
        console.log('\n▶️  Starte DTMF-Test...\n');

        // Welcome and language selection
        console.log('   [Test] DTMF-Sprachauswahl...');
        await call.say('Willkommen zum DTMF-Test.');
        await call.say('Drücken Sie die 1 für Deutsch oder die 2 für Englisch.');

        const choice = await call.collectDigits({
          maxDigits: 1,                         // Required: Maximum digits to collect
          announcementName: 'IVU_TEST_1',       // Required: Announcement name
          errorAnnouncementName: 'IVU_TEST_1'   // Required: Error announcement name
          // minDigits: 1,                      // Optional: Minimum digits (default: 1)
          // timeout: 10,                       // Optional: Timeout in seconds (default: 10)
          // allowSpeech: false,                // Optional: Enable speech input (default: false)
          // speechLanguage: 'de-DE'            // Optional: Language for speech (if allowSpeech: true)
        });

        console.log('   ✅ Benutzer drückte:', choice);

        // Respond based on language choice with appropriate announcement
        if (choice === '1') {
          await call.say('Sie haben Deutsch gewählt.');
          await call.say('Bitte geben Sie eine 3-stellige Zahl ein.');

          const germanInput = await call.collectDigits({
            maxDigits: 3,
            announcementName: 'IVU_TEST_1',
            errorAnnouncementName: 'IVU_TEST_1'
            // minDigits: 1,
            // timeout: 10
          });

          console.log('   ✅ Deutsche Eingabe:', germanInput);
          await call.say(`Sie haben ${germanInput} eingegeben. Vielen Dank.`);

        } else if (choice === '2') {
          await call.say('You selected English.');
          await call.say('Please enter a 3-digit number.');

          const englishInput = await call.collectDigits({
            maxDigits: 3,
            announcementName: 'IVU_TEST_EN_1',
            errorAnnouncementName: 'IVU_TEST_EN_1'
            // minDigits: 1,
            // timeout: 10
          });

          console.log('   ✅ Englische Eingabe:', englishInput);
          await call.say(`You entered ${englishInput}. Thank you.`);

        } else {
          await call.say('Ungültige Eingabe. Invalid input.');
        }

        // End call
        await call.say('Test abgeschlossen. Test completed.');
        await call.hangup('Auf Wiedersehen. Goodbye.');

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
