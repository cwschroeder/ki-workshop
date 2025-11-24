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
    console.log('🎉 DTMF Test Client Ready!');
    console.log('='.repeat(60));
    console.log('\n💡 Call now:', phoneNumber);
    console.log('\n📋 Test Flow:');
    console.log('   1. Welcome message');
    console.log('   2. Prompt to press 1 (German) or 2 (English)');
    console.log('   3. DTMF input with language-specific announcement');
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
        console.log('\n▶️  Starting DTMF test...\n');

        // Welcome and language selection
        console.log('   [Test] DTMF Language Selection...');
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

        console.log('   ✅ User pressed:', choice);

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

          console.log('   ✅ German input:', germanInput);
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

          console.log('   ✅ English input:', englishInput);
          await call.say(`You entered ${englishInput}. Thank you.`);

        } else {
          await call.say('Ungültige Eingabe. Invalid input.');
        }

        // End call
        await call.say('Test abgeschlossen. Test completed.');
        await call.hangup('Auf Wiedersehen. Goodbye.');

        console.log('\n✅ Test completed successfully!\n');
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
