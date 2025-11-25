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

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - MakeCall Test\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession({
      // serverUrl is used from lib/ivu-voice-client.ts default: wss://mqtt.ivu-software.de:443
    });

    console.log('✅ Verbunden mit IVU Voice API Server');

    // Assign phone number that will receive the outbound call (Leg B)
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
    console.log('🎉 MakeCall-Test-Client bereit!');
    console.log('='.repeat(60));

    // Configure outbound call parameters
    const destinationNumber = '+491757039338'; // Number to call (ohne führende 0 bei internationaler Vorwahl)
    const assignedNumber = phoneNumber; // Rufnummer with routing plan

    console.log('\n📋 Ausgehende Anruf-Konfiguration:');
    console.log(`   Ziel: ${destinationNumber}`);
    console.log(`   Rufnummer: ${assignedNumber}`);
    console.log(`   Anruf-Ablauf:`);
    console.log(`     1. API ruft ${destinationNumber} an`);
    console.log(`     2. Wenn abgenommen, ruft API ${assignedNumber} an`);
    console.log(`     3. Routingplan wird ausgeführt (diese Session verarbeitet ihn)`);
    console.log(`     4. Beide Leitungen werden verbunden`);

    // Wait for user confirmation
    console.log('\n⚠️  Drücken Sie Ctrl+C zum Abbrechen oder warten Sie 5 Sekunden zum Anruf-Start...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Initiate outbound call
    console.log('📞 Initiiere ausgehenden Anruf...');
    const result = await session.makeCall({
      destinationNumber,
      ivuNumber: assignedNumber,
      callerId: assignedNumber // Optional: Show phone number as caller ID
    });

    console.log(`✅ Anruf initiiert! Callback ID: ${result.callbackId}`);
    console.log('\n📋 Was als nächstes passiert:');
    console.log(`   1. ${destinationNumber} wird klingeln`);
    console.log(`   2. Wenn abgenommen wird, wird ${assignedNumber} klingeln`);
    console.log(`   3. Dieser Client wird das call.incoming Event erhalten`);
    console.log(`   4. Verarbeite den Anruf im Event-Handler unten\n`);

    // Handle incoming call (Leg B)
    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF (Leg B)!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));
      console.log('   Hinweis: Ziel hat bereits abgenommen (Leg A)\n');

      try {
        // Greet the destination party
        console.log('   [Aktion] Spiele Begrüßung ab...');
        await call.say('Hallo! Dies ist ein Test-Anruf über die IVU Voice API MakeCall API.');

        await call.say('Drücken Sie 1 um die Verbindung zu testen, oder 2 um aufzulegen.');

        const choice = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ Benutzer drückte:', choice);

        if (choice === '1') {
          await call.say('Verbindungstest erfolgreich. Der Anruf wird jetzt beendet.');
          await call.hangup('Auf Wiedersehen.');
        } else if (choice === '2') {
          await call.hangup('Auf Wiedersehen.');
        } else {
          await call.say('Ungültige Eingabe.');
          await call.hangup('Auf Wiedersehen.');
        }

        console.log('\n✅ MakeCall-Test abgeschlossen!');
        console.log('='.repeat(60));
        console.log('💡 Sie können diesen Client jetzt schließen (Ctrl+C)');
        console.log('='.repeat(60) + '\n');

      } catch (error) {
        console.error('\n❌ Fehler während des Anrufs:');
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
