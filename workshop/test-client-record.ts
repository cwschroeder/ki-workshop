/**
 * Test Client - RECORD (Call Recording API)
 *
 * Demonstrates the IVU Voice API Call Recording API.
 *
 * IMPORTANT: You are legally required to inform callers about recording!
 *
 * The Recording API allows you to:
 * - Start recording an ongoing call
 * - Stop recording at any time
 * - Retrieve the recording file
 * - Record caller, callee, or both channels
 *
 * Use cases:
 * - Quality assurance
 * - Training purposes
 * - Compliance/documentation
 * - Dispute resolution
 *
 * How it works:
 * 1. Call starts (you receive call_uuid from API)
 * 2. Call session.startRecording({ callUuid }) to begin
 * 3. Continue your call normally
 * 4. Call session.stopRecording({ callUuid, recordingUuid }) to end
 * 5. Call session.retrieveRecording({ recordingUuid }) to download
 */

import { createVoiceSession } from './lib/ivu-voice-client';
import * as fs from 'fs/promises';

async function main() {
  console.log('=== IVU Voice API Recording API Test ===\n');

  // Create session
  const session = await createVoiceSession({
    serverUrl: 'http://localhost:3000'
  });

  console.log('Session erstellt!\n');

  // Assign phone number
  const phoneNumber = '+494042237908'; // Your Rufnummer
  await session.assignPhoneNumber(phoneNumber);

  console.log(`Rufnummer zugewiesen: ${phoneNumber}`);
  console.log('Warte auf eingehenden Anruf...\n');

  // Track active recordings so we can retrieve them after call ends
  const activeRecordings = new Map<string, { callUuid: string; recordingUuid: string }>();

  // Handle call ended event
  session.on('call.ended', async (callId: string) => {
    console.log(`\n📵 Anruf beendet: ${callId}`);

    // Check if we have a recording for this call
    const recording = activeRecordings.get(callId);
    if (recording) {
      console.log(`\n📥 Lade Aufzeichnung herunter (${recording.recordingUuid})...`);

      try {
        // Stop recording first (might already be stopped, that's ok)
        try {
          await session.stopRecording({
            callUuid: recording.callUuid,
            recordingUuid: recording.recordingUuid
          });
          console.log('⏹️  Aufzeichnung gestoppt');
        } catch (error: any) {
          console.log(`⚠️  Stop recording: ${error.message} (möglicherweise bereits gestoppt)`);
        }

        // Retrieve recording
        const recordingData = await session.retrieveRecording({
          recordingUuid: recording.recordingUuid
        });

        // Save recording to file
        const filename = `recording-${recording.recordingUuid}.wav`;
        await fs.writeFile(filename, recordingData.data);

        console.log(`💾 Aufzeichnung gespeichert: ${filename}`);
        console.log(`📊 Content-Type: ${recordingData.contentType}`);
        console.log(`📏 Größe: ${recordingData.data.length} bytes\n`);
        console.log('✅ Aufzeichnung erfolgreich abgerufen!\n');

        activeRecordings.delete(callId);
      } catch (error: any) {
        console.error(`❌ Fehler beim Abrufen der Aufzeichnung: ${error.message}\n`);
      }
    }
  });

  // Handle incoming call
  session.on('call.incoming', async (call: any) => {
    console.log(`📞 Anruf empfangen: ${call.callId}\n`);

    // We need the call_uuid from API to start recording
    // This is provided in the call data from the API webhook
    const callUuid = call.callUuid;

    if (!callUuid) {
      console.error('❌ Fehler: call_uuid nicht verfügbar');
      await call.hangup();
      return;
    }

    console.log(`📋 Call UUID: ${callUuid}\n`);

    try {
      // Step 1: Greet caller
      await call.say('Willkommen beim Aufzeichnungs-Test.');

      // Step 2: Inform about recording (LEGALLY REQUIRED!)
      await call.say(
        'Dieser Anruf wird zu Qualitätssicherungs- und Schulungszwecken aufgezeichnet. ' +
        'Falls Sie der Aufzeichnung widersprechen möchten, drücken Sie bitte die Stern-Taste.'
      );

      // Step 3: Start recording via Recording API
      console.log('🔴 Starte Aufzeichnung via Recording API...');

      const recording = await session.startRecording({
        callUuid,
        recordCaller: true,  // Record caller channel
        recordCallee: true   // Record callee channel (both sides)
      });

      console.log(`✅ Aufzeichnung gestartet: ${recording.recordingUuid}\n`);

      // Store recording info for later retrieval
      activeRecordings.set(call.callId, { callUuid, recordingUuid: recording.recordingUuid });

      await call.say('Die Aufzeichnung beginnt jetzt.');

      // Step 4: Collect user input during recording
      // Note: If caller hangs up before speaking, the call.ended event will handle cleanup
      await call.collectSpeech({
        prompt: 'Bitte teilen Sie uns Ihr Anliegen mit. Sie können auch einfach auflegen.',
        timeout: 30
      });

    } catch (error: any) {
      console.error('❌ Fehler während des Anrufs:', error.message);
      // Don't call hangup here - the call might already be ended
      // The call.ended event will handle recording retrieval
    }
  });

  // Keep running
  console.log('Drücke Ctrl+C zum Beenden\n');

  // Prevent process from exiting
  await new Promise(() => {});
}

main().catch(console.error);
