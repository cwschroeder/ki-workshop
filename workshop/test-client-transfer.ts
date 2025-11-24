/**
 * Test Client - BRIDGE (Call Transfer)
 *
 * Tests call transfer functionality with BRIDGE block
 *
 * Bridge Modes:
 * - SEQUENTIAL: Try destinations one after another until one answers
 *   Use case: Try primary contact first, then fallback to secondary
 *
 * - PARALLEL: Ring all destinations simultaneously (first to answer wins)
 *   Use case: Ring entire team at once, whoever picks up first gets the call
 *
 * Multiple Destinations Example (modify server-side Provider):
 *
 * SEQUENTIAL (one after another):
 *   destinations: [
 *     { destination: 'alice', destinationType: 'SIP_USER', timeout: 20 },
 *     { destination: 'bob', destinationType: 'SIP_USER', timeout: 20 },
 *     { destination: '+4940123456', destinationType: 'PHONE_NUMBER', timeout: 30 }
 *   ]
 *
 * PARALLEL (all at once):
 *   destinations: [
 *     { destination: 'alice', destinationType: 'SIP_USER', timeout: 30 },
 *     { destination: 'bob', destinationType: 'SIP_USER', timeout: 30 },
 *     { destination: '+4940123456', destinationType: 'PHONE_NUMBER', timeout: 30 }
 *   ]
 */

import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Call Transfer Test\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession({
      serverUrl: 'ws://localhost:3000'
    });

    console.log('✅ Connected to IVU Voice API Server');

    const phoneNumber = '+494042237908';
    await session.assignPhoneNumber(phoneNumber);
    console.log('✅ Phone number assigned:', phoneNumber);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Transfer Test Client Ready!');
    console.log('='.repeat(60));
    console.log('\n💡 Call now:', phoneNumber);
    console.log('\n📋 Test Flow:');
    console.log('   1. Welcome message');
    console.log('   2. DTMF menu (press 1 for SIP transfer or 2 for phone transfer)');
    console.log('   3. Call transfer to selected destination\n');
    console.log('⏳ Waiting for calls...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 INCOMING CALL!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Call Details:');
      console.log('   Call ID:', call.callId);
      console.log('   Time:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starting transfer test...\n');

        // Welcome and transfer selection
        console.log('   [Test] Transfer Menu...');
        await call.say('Willkommen zum Transfer-Test.');
        await call.say('Drücken Sie die 1 für SIP-Weiterleitung oder die 2 für Telefon-Weiterleitung.');

        const choice = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ User pressed:', choice);

        // Transfer based on choice
        if (choice === '1') {
          await call.say('Sie werden zu einem SIP-Benutzer weitergeleitet.');
          console.log('   [Transfer] Bridging to SIP user...');

          await call.bridge('cwschroeder', {
            destinationType: 'SIP_USER',    // Optional: 'SIP_USER' or 'PHONE_NUMBER' (default: SIP_USER)
            timeout: 30,                     // Optional: Timeout in seconds (default: 30)
            // bridgeMode: 'SEQUENTIAL'      // Optional: 'SEQUENTIAL' or 'PARALLEL' (default: SEQUENTIAL)
            //                               // SEQUENTIAL: Try destinations one after another
            //                               // PARALLEL: Ring all destinations simultaneously
          });

        } else if (choice === '2') {
          await call.say('Sie werden zu einer Telefonnummer weitergeleitet.');
          console.log('   [Transfer] Bridging to phone number...');

          await call.bridge('+4940123456', {
            destinationType: 'PHONE_NUMBER',
            timeout: 30
            // bridgeMode: 'SEQUENTIAL'      // Optional: 'SEQUENTIAL' or 'PARALLEL' (default: SEQUENTIAL)
          });

        } else {
          await call.say('Ungültige Eingabe. Transfer wird abgebrochen.');
          await call.hangup('Auf Wiedersehen.');
        }

        console.log('\n✅ Transfer test completed!\n');
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
