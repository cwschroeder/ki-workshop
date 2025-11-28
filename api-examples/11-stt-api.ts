/**
 * Test 11 - STT (Speech-to-Text) API Demo
 *
 * Demonstriert die Verwendung der stt() API für Sprachtranskription.
 *
 * Dieser Test generiert zuerst Audio mit TTS und transkribiert es dann mit STT.
 *
 * ============================================================================
 * API REFERENZ: session.stt(options)
 * ============================================================================
 *
 * Parameter:
 * ----------
 * @param {Buffer} audio        - REQUIRED: Audio-Daten als Buffer
 *                                Unterstützte Formate: mp3, mp4, mpeg, mpga, m4a, wav, webm
 *
 * @param {string} language     - OPTIONAL: Sprache des Audios (BCP-47 Format)
 *                                Default: 'de-DE'
 *                                Beispiele: 'de-DE', 'en-US', 'fr-FR', 'es-ES', 'it-IT'
 *                                Hinweis: Wird intern zu ISO-639-1 konvertiert (de-DE → de)
 *
 * @param {string} model        - OPTIONAL: STT-Modell
 *                                Default: Vom Server konfiguriert
 *
 * Rückgabe:
 * ---------
 * @returns {Promise<{ text: string }>}
 *   - text: Der transkribierte Text
 *
 * Beispiele:
 * ----------
 * // Minimal
 * const result = await session.stt({ audio: audioBuffer });
 *
 * // Mit Sprache
 * const result = await session.stt({
 *   audio: audioBuffer,
 *   language: 'en-US'
 * });
 *
 * // Vollständig
 * const result = await session.stt({
 *   audio: audioBuffer,
 *   language: 'de-DE'
 * });
 * ============================================================================
 */

import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - STT (Speech-to-Text) API Demo\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession();
    console.log('✅ Verbunden mit IVU KI API Server\n');

    // ===================================================================
    // SCHRITT 1: Audio mit TTS generieren (als Test-Input für STT)
    // ===================================================================
    console.log('[Schritt 1] Audio generieren mit TTS');
    console.log('─'.repeat(60));

    const testText = 'Hallo, das ist ein Test der Spracherkennung. Die Kundennummer ist eins zwei drei vier fünf.';
    console.log(`Generiere Audio für: "${testText}"\n`);

    const ttsResult = await session.tts({
      text: testText,
      voice: 'alloy',      // Stimme für TTS (siehe 12-tts-api.ts für alle Optionen)
      language: 'de-DE'    // Sprache für TTS
    });

    console.log(`✅ Audio generiert: ${ttsResult.audio.length} Bytes (${ttsResult.contentType})\n`);

    // ===================================================================
    // SCHRITT 2: Audio transkribieren mit STT
    // ===================================================================
    console.log('[Schritt 2] Audio transkribieren mit STT');
    console.log('─'.repeat(60));

    const sttResult = await session.stt({
      audio: ttsResult.audio,  // REQUIRED: Audio-Buffer (mp3, wav, etc.)
      language: 'de-DE'        // OPTIONAL: Sprache (default: 'de-DE')
      // model: 'default'      // OPTIONAL: STT-Modell (vom Server konfiguriert)
    });

    console.log('Transkribierter Text:');
    console.log(`"${sttResult.text}"\n`);

    // ===================================================================
    // VERGLEICH: Original vs. Transkription
    // ===================================================================
    console.log('[Vergleich] Original vs. Transkription');
    console.log('─'.repeat(60));
    console.log(`Original:      "${testText}"`);
    console.log(`Transkription: "${sttResult.text}"`);
    console.log('');

    // Einfache Ähnlichkeitsprüfung (Case-insensitive)
    const originalLower = testText.toLowerCase();
    const transcriptLower = sttResult.text.toLowerCase();

    // Prüfe ob wichtige Wörter erkannt wurden
    const keyWords = ['test', 'spracherkennung', 'kundennummer'];
    const foundWords = keyWords.filter(word => transcriptLower.includes(word));

    console.log(`Erkannte Schlüsselwörter: ${foundWords.length}/${keyWords.length}`);
    foundWords.forEach(word => console.log(`  ✓ "${word}" erkannt`));
    console.log('');

    // ===================================================================
    // BEISPIEL 2: STT mit verschiedenen Sprachen
    // ===================================================================
    console.log('[Demo 2] STT - Englisches Audio');
    console.log('─'.repeat(60));

    const englishText = 'Hello, this is a test of speech recognition. The customer number is one two three four five.';
    console.log(`Generiere englisches Audio...\n`);

    const englishAudio = await session.tts({
      text: englishText,
      voice: 'echo',
      language: 'en-US'
    });

    const englishResult = await session.stt({
      audio: englishAudio.audio,
      language: 'en-US'
    });

    console.log(`Original (EN):      "${englishText}"`);
    console.log(`Transkription (EN): "${englishResult.text}"\n`);

    // ===================================================================
    // ZUSAMMENFASSUNG
    // ===================================================================
    console.log('='.repeat(60));
    console.log('✅ STT-API Demo erfolgreich abgeschlossen!\n');
    console.log('💡 Was Sie gelernt haben:');
    console.log('   ✓ stt() API für Audio-Transkription');
    console.log('   ✓ Unterstützung verschiedener Sprachen (de-DE, en-US)');
    console.log('   ✓ Audio als Buffer übergeben');
    console.log('');
    console.log('📝 Für Voice-Bots:');
    console.log('   Typischer Workflow:');
    console.log('   1. Audio aufnehmen (recording.start/stop)');
    console.log('   2. stt() für Transkription');
    console.log('   3. chat() für KI-Antwort');
    console.log('   4. tts() für Audio-Ausgabe');
    console.log('');
    console.log('='.repeat(60));

    session.stop();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Schwerwiegender Fehler:');
    console.error(error);
    process.exit(1);
  }
}

main();
