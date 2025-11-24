/**
 * Test Client - Speech Recognition Only
 *
 * Tests collectSpeech (ASR) without COLLECT_DIGITS
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Speech Recognition Test\n');
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
    console.log('🎉 Speech Test Client Ready!');
    console.log('='.repeat(60));
    console.log('\n💡 Call now:', phoneNumber);
    console.log('\n📋 Test Flow:');
    console.log('   1. Welcome message');
    console.log('   2. Speech input (say your name)');
    console.log('   3. Confirmation & hangup\n');
    console.log('⏳ Waiting for calls...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 INCOMING CALL!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Call Details:');
      console.log('   Call ID:', call.callId);
      console.log('   Time:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starting speech test...\n');

        // Test: Say + collectSpeech (ASR)
        console.log('   [Test] Speech Recognition...');
        await call.say('Willkommen zum Sprach-Test.');
        await call.say('Bitte nennen Sie Ihren Namen.');

        const speech = await call.collectSpeech({
          language: 'de-DE',       // Required: Language code (e.g., 'de-DE', 'en-US')
          timeout: 5              // Optional: Timeout in seconds (default: 10)
          // maxTries: 2,          // Optional: Maximum number of tries (default: 2)
          // prompt: 'Sprechen Sie jetzt'  // Optional: Custom prompt text
        });

        console.log('   ✅ User said:', speech);

        // Respond with recognition result
        await call.say(`Vielen Dank, ${speech || 'unbekannter Name'}.`);
        await call.say('Test erfolgreich abgeschlossen.');
        await call.hangup('Auf Wiedersehen!');

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
