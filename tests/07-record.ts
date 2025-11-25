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

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';
import * as fs from 'fs/promises';

// Helper: Wait with retry for recording to be available
async function retrieveRecordingWithRetry(
  session: any,
  recordingUuid: string,
  maxRetries = 5,
  delayMs = 2000
): Promise<{ data: Buffer; contentType: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Versuch ${attempt}/${maxRetries}...`);
      const result = await session.retrieveRecording({ recordingUuid });
      return result;
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`   ⏳ Aufzeichnung noch nicht bereit, warte ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Max retries reached');
}

async function main() {
  console.log('=== IVU Voice API Recording API Test ===\n');

  // Create session
  const session = await createVoiceSession({
    // serverUrl is used from lib/ivu-voice-client.ts default: wss://mqtt.ivu-software.de:443
  });

  console.log('Session erstellt!\n');

  // Assign phone number (required from environment)
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

  console.log(`Rufnummer zugewiesen: ${phoneNumber}`);
  console.log('Warte auf eingehenden Anruf...\n');

  // Track active recordings and processed calls
  const activeRecordings = new Map<string, { callUuid: string; recordingUuid: string }>();
  const processedCalls = new Set<string>();

  // Handle incoming call (use once to prevent duplicate processing)
  session.on('call.incoming', async (call: any) => {
    // Prevent duplicate processing
    if (processedCalls.has(call.callId)) {
      return;
    }
    processedCalls.add(call.callId);

    console.log(`📞 Eingehender Anruf: ${call.callId}\n`);

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
      const userInput = await call.collectSpeech({
        prompt: 'Bitte teilen Sie uns Ihr Anliegen mit. Sprechen Sie nach dem Signalton.',
        timeout: 10
      });

      console.log(`💬 Benutzer sagte: "${userInput}"`);

      await call.say(`Sie sagten: ${userInput}. Die Aufzeichnung wird jetzt beendet.`);

      // Step 5: Stop recording and retrieve
      console.log('\n⏹️  Stoppe Aufzeichnung...');
      try {
        await session.stopRecording({
          callUuid,
          recordingUuid: recording.recordingUuid
        });
        console.log('✅ Aufzeichnung gestoppt');
      } catch (stopError: any) {
        console.log(`⚠️  Stop: ${stopError.message}`);
      }

      // Step 6: Retrieve recording (with retry - Tenios needs time to process)
      console.log('\n📥 Lade Aufzeichnung herunter...');
      const recordingData = await retrieveRecordingWithRetry(
        session,
        recording.recordingUuid
      );

      // Save recording to file
      const filename = `output/recording-${recording.recordingUuid}.wav`;
      await fs.mkdir('output', { recursive: true });
      await fs.writeFile(filename, recordingData.data);

      console.log(`💾 Aufzeichnung gespeichert: ${filename}`);
      console.log(`📊 Content-Type: ${recordingData.contentType}`);
      console.log(`📏 Größe: ${recordingData.data.length} bytes`);

      await call.hangup('Vielen Dank für Ihre Nachricht. Auf Wiederhören!');

      console.log('\n✅ Aufzeichnungs-Test erfolgreich abgeschlossen!');
      activeRecordings.delete(call.callId);

    } catch (error: any) {
      console.error('❌ Fehler während des Anrufs:', error.message);

      // Try to retrieve recording anyway if we have one
      const recording = activeRecordings.get(call.callId);
      if (recording) {
        console.log('\n📥 Versuche Aufzeichnung trotz Fehler abzurufen...');
        try {
          // Try to stop first
          try {
            await session.stopRecording({
              callUuid: recording.callUuid,
              recordingUuid: recording.recordingUuid
            });
          } catch {
            // Ignore - might already be stopped
          }

          const recordingData = await retrieveRecordingWithRetry(
            session,
            recording.recordingUuid
          );

          const filename = `output/recording-${recording.recordingUuid}.wav`;
          await fs.mkdir('output', { recursive: true });
          await fs.writeFile(filename, recordingData.data);

          console.log(`💾 Aufzeichnung gespeichert: ${filename}`);
          console.log(`📏 Größe: ${recordingData.data.length} bytes`);
          activeRecordings.delete(call.callId);
        } catch (retrieveError: any) {
          console.error(`❌ Konnte Aufzeichnung nicht abrufen: ${retrieveError.message}`);
        }
      }
    }
  });

  // Keep running
  console.log('Drücken Sie Ctrl+C zum Beenden\n');

  // Prevent process from exiting
  await new Promise(() => {});
}

main().catch(console.error);
