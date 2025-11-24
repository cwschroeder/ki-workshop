/**
 * Test Client - BRIDGE (Call Transfer)
 *
 * Tests call transfer functionality with BRIDGE block to SIP users.
 *
 * Bridge Modes:
 * - SEQUENTIAL: Try destinations one after another until one answers
 *   Use case: Try primary contact first, then fallback to secondary
 *
 * - PARALLEL: Ring all destinations simultaneously (first to answer wins)
 *   Use case: Ring entire team at once, whoever picks up first gets the call
 *
 * Multiple Destinations Example:
 *
 * SEQUENTIAL (one after another):
 *   destinations: [
 *     { destination: 'alice', destinationType: 'SIP_USER', timeout: 20 },
 *     { destination: 'bob', destinationType: 'SIP_USER', timeout: 20 }
 *   ]
 *
 * PARALLEL (all at once):
 *   destinations: [
 *     { destination: 'alice', destinationType: 'SIP_USER', timeout: 30 },
 *     { destination: 'bob', destinationType: 'SIP_USER', timeout: 30 }
 *   ]
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Call Transfer Test\n');
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
    console.log('🎉 Transfer-Test-Client bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Willkommensnachricht');
    console.log('   2. Weiterleitung zu SIP-Benutzer "cwschroeder"\n');
    console.log('⏳ Warte auf Anrufe...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starte Transfer-Test...\n');

        // Welcome and transfer
        console.log('   [Test] Begrüßung...');
        await call.say('Willkommen zum Transfer-Test. Sie werden jetzt zu einem SIP-Benutzer weitergeleitet.');

        console.log('   [Transfer] Verbinde mit SIP-Benutzer "cwschroeder"...');
        await call.bridge('cwschroeder', {
          destinationType: 'SIP_USER',    // SIP_USER für Weiterleitung an SIP-Account
          timeout: 30,                     // Optional: Timeout in Sekunden (default: 30)
          // bridgeMode: 'SEQUENTIAL'      // Optional: 'SEQUENTIAL' oder 'PARALLEL' (default: SEQUENTIAL)
          //                               // SEQUENTIAL: Ziele nacheinander anrufen
          //                               // PARALLEL: Alle Ziele gleichzeitig anrufen
        });

        console.log('\n✅ Transfer-Test abgeschlossen!\n');
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
