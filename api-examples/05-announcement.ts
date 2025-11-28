/**
 * Test Client - ANNOUNCEMENT (Pre-recorded Audio)
 *
 * Tests playback of pre-configured audio files from IVU Voice API portal.
 *
 * IMPORTANT: Announcements must be uploaded and configured in the API portal first.
 *
 * How to configure announcements:
 * 1. Log in to API portal
 * 2. Navigate to "Announcements" section
 * 3. Upload audio file (WAV, MP3, etc.)
 * 4. Give it a unique name (e.g., "IVU_WELCOME", "IVU_MENU", "IVU_HOLD_MUSIC")
 * 5. Use that name in call.playAnnouncement()
 *
 * Common use cases:
 * - Welcome messages: Professional greeting in high quality
 * - IVR menus: "Press 1 for sales, 2 for support..."
 * - Hold music: While transferring or waiting
 * - Custom prompts: Specific instructions for callers
 *
 * Advantages over TTS (SAY):
 * - Higher audio quality (professional recordings)
 * - Consistent voice/branding
 * - Faster playback (no TTS processing)
 * - Support for music/sound effects
 */

import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Announcement Test\n');
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
    console.log('🎉 Ansage-Test-Client bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Spiele voraufgezeichnete Willkommensansage ab');
    console.log('   2. DTMF-Menü zur Auswahl verschiedener Ansagen');
    console.log('   3. Spiele ausgewählte Ansage ab\n');
    console.log('⏳ Warte auf Anrufe...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starte Ansage-Test...\n');

        // Play welcome announcement
        console.log('   [Test] Spiele Willkommensansage ab...');
        await call.playAnnouncement('IVU_TEST_1');

        // Menu for selecting announcements
        console.log('   [Test] Ansage-Menü...');
        await call.say('Drücken Sie 1 für eine weitere Testansage, 2 um zu beenden.');

        const choice = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ Benutzer drückte:', choice);

        if (choice === '1') {
          // Play another announcement
          console.log('   [Test] Spiele zweite Ansage ab...');
          await call.playAnnouncement('IVU_TEST_1');
          await call.say('Das war die zweite Testansage.');
          await call.hangup('Auf Wiedersehen.');

        } else if (choice === '2') {
          // End call
          await call.hangup('Vielen Dank für Ihren Anruf. Auf Wiedersehen.');

        } else {
          // Invalid input
          await call.say('Ungültige Eingabe.');
          await call.hangup('Auf Wiedersehen.');
        }

        console.log('\n✅ Ansage-Test abgeschlossen!\n');
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
