/**
 * Test Client for IVU Voice API
 *
 * Usage:
 *   1. Run this script: npx tsx test-client.ts
 *   2. Call the assigned phone number
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Test Client\n');
  console.log('=' .repeat(60));

  try {
    // Connect to IVU Voice API Server
    console.log('\n📡 Connecting to IVU Voice API...');
    const session = await createVoiceSession({
      // serverUrl is used from lib/ivu-voice-client.ts default: wss://mqtt.ivu-software.de:443
    });

    console.log('✅ Connected to IVU Voice API Server');

    // Rufnummer zuweisen
    console.log('\n📞 Assigning phone number...');

    // Test-Rufnummer (required from environment)
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
    console.log('🎉 Test-Client bereit!');
    console.log('=' .repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Was passiert:');
    console.log('   1. Sie rufen die Nummer an');
    console.log('   2. API sendet API webhook an IVU Voice API Server');
    console.log('   3. Server routet Call zu dieser Session');
    console.log('   4. Dieser Client empfängt call.incoming Event');
    console.log('   5. Client antwortet mit SAY + HANGUP');
    console.log('   6. Sie hören die Ansage am Telefon\n');
    console.log('⏳ Waiting for calls...\n');
    console.log('Press Ctrl+C to stop\n');

    // Call-Handler registrieren
    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 INCOMING CALL!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Call Details:');
      console.log('   Call ID:', call.callId);
      console.log('   Session:', call.sessionId);
      console.log('   Time:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Executing call flow...\n');

        // Schritt 1: Begrüßung
        console.log('   [1/3] Saying hello...');
        await call.say('Hallo! Willkommen beim IVU Voice API Test.'
          // Optional parameters:
          // { voice: 'de.female.2' }  // Voice name (default: de.female.2)
          // { useSsml: false }         // Use SSML markup (default: false)
        );

        // Schritt 2: Status
        console.log('   [2/3] Confirming test...');
        await call.say('Die IVU Voice API funktioniert einwandfrei.');

        // Schritt 3: Verabschiedung
        console.log('   [3/3] Hanging up...');
        await call.hangup('Vielen Dank. Auf Wiedersehen!');

        console.log('\n✅ Call handled successfully!\n');
        console.log('=' .repeat(60));
        console.log('💡 Sie können erneut anrufen oder Ctrl+C drücken');
        console.log('=' .repeat(60) + '\n');

      } catch (error) {
        console.error('\n❌ Error handling call:');
        console.error(error);
        console.log('');
      }
    });

    // User-Input Handler (wenn collectSpeech/collectDigits verwendet wird)
    session.on('call.user_input', (input) => {
      console.log('💬 User input received:', input);
    });

    // Call-Ended Handler
    session.on('call.ended', (callId) => {
      console.log('📵 Call ended:', callId);
      console.log('⏳ Waiting for next call...\n');
    });

    // Error Handler
    session.on('error', (error) => {
      console.error('\n❌ Session error:');
      console.error(error);
      console.log('');
    });

    // Disconnected Handler
    session.on('disconnected', (reason) => {
      console.log('\n⚠️  Disconnected from server:', reason);
      console.log('Attempting to reconnect...\n');
    });

    // Session Ready Handler
    session.on('session.ready', (data) => {
      console.log('🎯 Session ready:', data);
    });

    // Keep alive - script läuft bis Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n👋 Shutting down test client...');
      session.stop();
      console.log('✅ Disconnected from server');
      console.log('Goodbye!\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Fatal error:');
    console.error(error);
    console.log('\n💡 Troubleshooting:');
    console.log('   - Check your network connection');
    console.log('   - Verify the IVU Voice API Server is accessible');
    console.log('   - Check server logs for errors\n');
    process.exit(1);
  }
}

main();
