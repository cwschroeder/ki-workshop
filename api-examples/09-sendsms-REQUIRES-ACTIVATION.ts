/**
 * Test Client - SEND SMS
 *
 * ⚠️  IMPORTANT: REQUIRES IVU Voice API SMS API ACTIVATION
 *
 * The SMS API must be enabled for your IVU Voice API account before using this feature.
 * Contact IVU Voice API customer support to request activation and receive your
 * Account-SID and Auth Token credentials.
 *
 * Error without activation:
 * "IVU Voice API SMS API requires Account-SID and Auth Token. These credentials must
 * be provided to IVU Provider constructor. Contact IVU Voice API support to enable
 * SMS API and receive credentials."
 *
 * Once activated, you need to:
 * 1. Add IVU_ACCOUNT_SID to your .env file
 * 2. Add IVU_AUTH_TOKEN to your .env file
 * 3. Update ProviderFactory to pass these credentials to IVU Provider
 */

import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('=== IVU Voice API SMS API Test ===\n');

  // Create session
  const session = await createVoiceSession({
    // serverUrl is used from lib/ivu-voice-client.ts default: wss://mqtt.ivu-software.de:443
  });

  console.log('Session erstellt!\n');

  // Configure SMS parameters
  const from = 'IVU-Test'; // Sender ID (max 11 alphanumeric characters)
  const to = '+491757039338'; // Phone number in E.164 format (ohne führende 0 bei internationaler Vorwahl)
  const text = 'Hallo! Dies ist eine Test-SMS von der IVU Voice API SMS API.';

  console.log(`Sende SMS an: ${to}`);
  console.log(`Von: ${from}`);
  console.log(`Text: ${text}\n`);

  try {
    // Send SMS
    const result = await session.sendSMS({
      from,
      to,
      text,
      tag: 'test-sms' // Optional tag for tracking
    });

    console.log('✅ SMS erfolgreich gesendet!');
    console.log(`Nachrichten URI: ${result.messageUri}`);
    console.log(`Status: ${result.status}`);
  } catch (error: any) {
    console.error('❌ Fehler beim SMS-Versand:');
    console.error(error.message);

    if (error.message.includes('Account-SID and Auth Token')) {
      console.log('\n⚠️  SMS API ist nicht aktiviert oder Zugangsdaten fehlen!');
      console.log('Kontaktieren Sie IVU Voice API Support für Aktivierung.');
    }
  }

  // Cleanup
  session.stop();
  console.log('\nSession beendet.');
  process.exit(0);
}

main().catch(console.error);
