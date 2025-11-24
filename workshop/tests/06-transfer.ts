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
    console.log('   2. DTMF-Menü (drücken Sie 1 für SIP-Transfer oder 2 für Telefon-Transfer)');
    console.log('   3. Anruf-Weiterleitung zum ausgewählten Ziel\n');
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

        // Welcome and transfer selection
        console.log('   [Test] Transfer-Menü...');
        await call.say('Willkommen zum Transfer-Test.');
        await call.say('Drücken Sie die 1 für SIP-Weiterleitung oder die 2 für Telefon-Weiterleitung.');

        const choice = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ Benutzer drückte:', choice);

        // Transfer based on choice
        if (choice === '1') {
          await call.say('Sie werden zu einem SIP-Benutzer weitergeleitet.');
          console.log('   [Transfer] Verbinde mit SIP-Benutzer...');

          await call.bridge('cwschroeder', {
            destinationType: 'SIP_USER',    // Optional: 'SIP_USER' or 'PHONE_NUMBER' (default: SIP_USER)
            timeout: 30,                     // Optional: Timeout in seconds (default: 30)
            // bridgeMode: 'SEQUENTIAL'      // Optional: 'SEQUENTIAL' or 'PARALLEL' (default: SEQUENTIAL)
            //                               // SEQUENTIAL: Try destinations one after another
            //                               // PARALLEL: Ring all destinations simultaneously
          });

        } else if (choice === '2') {
          await call.say('Sie werden zu einer Telefonnummer weitergeleitet.');
          console.log('   [Transfer] Verbinde mit Telefonnummer...');

          await call.bridge('+4940123456', {
            destinationType: 'PHONE_NUMBER',
            timeout: 30
            // bridgeMode: 'SEQUENTIAL'      // Optional: 'SEQUENTIAL' or 'PARALLEL' (default: SEQUENTIAL)
          });

        } else {
          await call.say('Ungültige Eingabe. Transfer wird abgebrochen.');
          await call.hangup('Auf Wiedersehen.');
        }

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
