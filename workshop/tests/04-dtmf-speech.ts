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

    console.log('✅ Connected to IVU Voice API Server');

    const phoneNumber = process.env.PHONE_NUMBER;
    if (!phoneNumber) {
      console.error('❌ ERROR: PHONE_NUMBER environment variable is not set!');
      console.error('');
      console.error('Please set your phone number:');
      console.error('  1. Copy .env.example to .env');
      console.error('  2. Edit .env and set PHONE_NUMBER=+49...');
      console.error('  3. Run the script again');
      console.error('');
      process.exit(1);
    }

    await session.assignPhoneNumber(phoneNumber);
    console.log('✅ Phone number assigned:', phoneNumber);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Combined Test Client Ready!');
    console.log('='.repeat(60));
    console.log('\n💡 Call now:', phoneNumber);
    console.log('\n📋 Test Flow:');
    console.log('   1. Welcome message');
    console.log('   2. DTMF menu (press 1 for German or 2 for English)');
    console.log('   3. Speech input (say your name)');
    console.log('   4. Confirmation & hangup\n');
    console.log('⏳ Waiting for calls...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 INCOMING CALL!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Call Details:');
      console.log('   Call ID:', call.callId);
      console.log('   Time:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starting combined test flow...\n');

        // Test 1: Say + collectDigits (DTMF)
        console.log('   [Test 1] DTMF Input...');
        await call.say('Willkommen zum kombinierten Test.');
        await call.say('Drücken Sie die 1 für Deutsch oder die 2 für Englisch.');

        const digits = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ User pressed:', digits);

        // Respond based on input
        if (digits === '1') {
          await call.say('Sie haben Deutsch gewählt.');
        } else if (digits === '2') {
          await call.say('You selected English.');
        } else {
          await call.say('Ungültige Eingabe.');
        }

        // Test 2: collectSpeech (ASR)
        console.log('   [Test 2] Speech Recognition...');
        await call.say('Bitte nennen Sie Ihren Namen.');

        const speech = await call.collectSpeech({
          language: 'de-DE',
          timeout: 10
        });

        console.log('   ✅ User said:', speech);

        // Respond with recognition result
        await call.say(`Vielen Dank, ${speech || 'unbekannter Name'}.`);

        // Test 3: Final message and hangup
        console.log('   [Test 3] Hangup...');
        await call.say('Alle Tests erfolgreich abgeschlossen.');
        await call.hangup('Auf Wiedersehen!');

        console.log('\n✅ All tests completed successfully!\n');
        console.log('='.repeat(60));
        console.log('💡 Call again or press Ctrl+C to stop');
        console.log('='.repeat(60) + '\n');

      } catch (error) {
        console.error('\n❌ Error during test:');
        console.error(error);
        console.log('');
      }
    });

    // User input handler
    session.on('call.user_input', (input) => {
      console.log('💬 User input received:', input);
    });

    // Call ended handler
    session.on('call.ended', (callId) => {
      console.log('📵 Call ended:', callId);
      console.log('⏳ Waiting for next call...\n');
    });

    // Error handler
    session.on('error', (error) => {
      console.error('\n❌ Session error:');
      console.error(error);
      console.log('');
    });

    // Keep alive
    process.on('SIGINT', () => {
      console.log('\n\n👋 Shutting down...');
      session.stop();
      console.log('✅ Disconnected');
      console.log('Goodbye!\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Fatal error:');
    console.error(error);
    process.exit(1);
  }
}

main();
