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

import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Announcement Test\n');
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
    console.log('🎉 Announcement Test Client Ready!');
    console.log('='.repeat(60));
    console.log('\n💡 Call now:', phoneNumber);
    console.log('\n📋 Test Flow:');
    console.log('   1. Play pre-recorded welcome announcement');
    console.log('   2. DTMF menu for selecting different announcements');
    console.log('   3. Play selected announcement\n');
    console.log('⏳ Waiting for calls...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 INCOMING CALL!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Call Details:');
      console.log('   Call ID:', call.callId);
      console.log('   Time:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starting announcement test...\n');

        // Play welcome announcement
        console.log('   [Test] Playing welcome announcement...');
        await call.playAnnouncement('IVU_TEST_1');

        // Menu for selecting announcements
        console.log('   [Test] Announcement Menu...');
        await call.say('Drücken Sie 1 für eine weitere Testansage, 2 um zu beenden.');

        const choice = await call.collectDigits({
          maxDigits: 1,
          announcementName: 'IVU_TEST_1',
          errorAnnouncementName: 'IVU_TEST_1'
        });

        console.log('   ✅ User pressed:', choice);

        if (choice === '1') {
          // Play another announcement
          console.log('   [Test] Playing second announcement...');
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

        console.log('\n✅ Announcement test completed!\n');
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
