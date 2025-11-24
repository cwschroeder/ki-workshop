/**
 * Test Client - MAKECALL (Outbound Calls)
 *
 * ⚠️  IMPORTANT: REQUIRES IVU Voice API MAKECALL API ACTIVATION
 *
 * The MakeCall API must be enabled for your IVU Voice API account before using this feature.
 * Contact IVU Voice API customer support to request activation.
 *
 * Error without activation:
 * "MAKE_CALL_IS_NOT_ENABLED: The make call api method is not enabled for this account"
 *
 * Tests outbound call initiation using IVU Voice API MakeCall API.
 *
 * How MakeCall works:
 * 1. Client calls session.makeCall() with destination and phone number
 * 2. Server sends HTTP request to IVU Voice API MakeCall API
 * 3. API calls the destination_number (Leg A)
 * 4. When destination answers, API calls the assigned number (Leg B)
 * 5. The routing plan configured for the number is executed
 * 6. Both call legs are bridged together
 *
 * Use cases:
 * - Click-to-call functionality
 * - Automated outbound campaigns
 * - Reminder/notification calls
 * - Conference call initiation
 *
 * Required parameters:
 * - destinationNumber: The number to call (e.g., +491234567890)
 * - phoneNumber: Your phone number that handles the call (configured with routing plan)
 *
 * Optional parameters:
 * - callerId: Number displayed to called party (must be verified in API portal)
 */

import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - MakeCall Test\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession({
      serverUrl: 'ws://localhost:3000'
    });

    console.log('✅ Connected to IVU Voice API Server');

    // Assign phone number that will receive the outbound call (Leg B)
    const phoneNumber = '+494042237908';
    await session.assignPhoneNumber(phoneNumber);
    console.log('✅ Phone number assigned:', phoneNumber);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 MakeCall Test Client Ready!');
    console.log('='.repeat(60));

    // Configure outbound call parameters
    const destinationNumber = '+491757039338'; // Number to call (ohne führende 0 bei internationaler Vorwahl)
    const assignedNumber = phoneNumber; // Rufnummer with routing plan

    console.log('\n📋 Outbound Call Configuration:');
    console.log(`   Destination: ${destinationNumber}`);
    console.log(`   Rufnummer: ${assignedNumber}`);
    console.log(`   Call flow:`);
    console.log(`     1. API calls ${destinationNumber}`);
    console.log(`     2. When answered, API calls ${assignedNumber}`);
    console.log(`     3. Routing plan executes (this session handles it)`);
    console.log(`     4. Both legs are bridged`);

    // Wait for user confirmation
    console.log('\n⚠️  Press Ctrl+C to cancel, or wait 5 seconds to initiate call...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Initiate outbound call
    console.log('📞 Initiating outbound call...');
    const result = await session.makeCall({
      destinationNumber,
      teniosNumber: assignedNumber,
      callerId: assignedNumber // Optional: Show phone number as caller ID
    });

    console.log(`✅ Call initiated! Callback ID: ${result.callbackId}`);
    console.log('\n📋 What happens next:');
    console.log(`   1. ${destinationNumber} will ring`);
    console.log(`   2. When they answer, ${assignedNumber} will ring`);
    console.log(`   3. This client will receive the call.incoming event`);
    console.log(`   4. Handle the call in the event handler below\n`);

    // Handle incoming call (Leg B)
    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 INCOMING CALL (Leg B)!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Call Details:');
      console.log('   Call ID:', call.callId);
      console.log('   Time:', new Date().toLocaleString('de-DE'));
      console.log('   Note: Destination already answered (Leg A)\n');

      try {
        // Greet the destination party
        console.log('   [Action] Playing greeting...');
        await call.say('Hallo! Dies ist ein Test-Anruf über die IVU Voice API MakeCall API.');

        await call.say('Drücken Sie 1 um die Verbindung zu testen, oder 2 um aufzulegen.');

        const choice = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ User pressed:', choice);

        if (choice === '1') {
          await call.say('Verbindungstest erfolgreich. Der Anruf wird jetzt beendet.');
          await call.hangup('Auf Wiedersehen.');
        } else if (choice === '2') {
          await call.hangup('Auf Wiedersehen.');
        } else {
          await call.say('Ungültige Eingabe.');
          await call.hangup('Auf Wiedersehen.');
        }

        console.log('\n✅ MakeCall test completed!');
        console.log('='.repeat(60));
        console.log('💡 You can close this client now (Ctrl+C)');
        console.log('='.repeat(60) + '\n');

      } catch (error) {
        console.error('\n❌ Error during call:');
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
