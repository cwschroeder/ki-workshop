/**
 * Test Client for IVU Voice API
 *
 * Usage:
 *   1. Run this script: npx tsx test-client.ts
 *   2. Call the assigned phone number
 */

import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Test Client\n');
  console.log('=' .repeat(60));

  try {
    // Connect to IVU Voice API Server
    console.log('\n📡 Verbinde mit IVU Voice API...');
    const session = await createVoiceSession({
      // serverUrl is used from lib/ivu-voice-client.ts default: wss://mqtt.ivu-software.de:443
    });

    console.log('✅ Verbunden mit IVU Voice API Server');

    // Rufnummer zuweisen
    console.log('\n📞 Weise Telefonnummer zu...');

    // Test-Rufnummer (required from environment)
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
    console.log('⏳ Warte auf Anrufe...\n');
    console.log('Drücken Sie Ctrl+C zum Beenden\n');

    // Call-Handler registrieren
    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Session:', call.sessionId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Führe Anruf-Ablauf aus...\n');

        // Schritt 1: Begrüßung
        console.log('   [1/3] Sage Hallo...');
        await call.say('Hallo! Willkommen beim IVU Voice API Test.'
          // Optional parameters:
          // { voice: 'de.female.2' }  // Voice name (default: de.female.2)
          // { useSsml: false }         // Use SSML markup (default: false)
        );

        // Schritt 2: Status
        console.log('   [2/3] Bestätige Test...');
        await call.say('Die IVU Voice API funktioniert einwandfrei.');

        // Schritt 3: Verabschiedung
        console.log('   [3/3] Lege auf...');
        await call.hangup('Vielen Dank. Auf Wiedersehen!');

        console.log('\n✅ Anruf erfolgreich behandelt!\n');
        console.log('=' .repeat(60));
        console.log('💡 Sie können erneut anrufen oder Ctrl+C drücken');
        console.log('=' .repeat(60) + '\n');

      } catch (error) {
        console.error('\n❌ Fehler bei der Anruf-Behandlung:');
        console.error(error);
        console.log('');
      }
    });

    // User-Input Handler (wenn collectSpeech/collectDigits verwendet wird)
    session.on('call.user_input', (input) => {
      console.log('💬 Benutzereingabe erhalten:', input);
    });

    // Call-Ended Handler
    session.on('call.ended', (callId) => {
      console.log('📵 Anruf beendet:', callId);
      console.log('⏳ Warte auf nächsten Anruf...\n');
    });

    // Error Handler
    session.on('error', (error) => {
      console.error('\n❌ Session-Fehler:');
      console.error(error);
      console.log('');
    });

    // Disconnected Handler
    session.on('disconnected', (reason) => {
      console.log('\n⚠️  Vom Server getrennt:', reason);
      console.log('Versuche erneut zu verbinden...\n');
    });

    // Session Ready Handler
    session.on('session.ready', (data) => {
      console.log('🎯 Session bereit:', data);
    });

    // Keep alive - script läuft bis Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n👋 Fahre Test-Client herunter...');
      session.stop();
      console.log('✅ Vom Server getrennt');
      console.log('Auf Wiedersehen!\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Schwerwiegender Fehler:');
    console.error(error);
    console.log('\n💡 Problemlösung:');
    console.log('   - Prüfen Sie Ihre Netzwerkverbindung');
    console.log('   - Überprüfen Sie, ob der IVU Voice API Server erreichbar ist');
    console.log('   - Prüfen Sie die Server-Logs auf Fehler\n');
    process.exit(1);
  }
}

main();
