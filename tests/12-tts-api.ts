/**
 * Test 12 - TTS (Text-to-Speech) API Demo
 *
 * Demonstriert die Verwendung der tts() API für Sprachsynthese.
 *
 * ============================================================================
 * API REFERENZ: session.tts(options)
 * ============================================================================
 *
 * Parameter:
 * ----------
 * @param {string} text         - REQUIRED: Der zu synthetisierende Text
 *                                Max. Länge: 4096 Zeichen
 *
 * @param {string} voice        - OPTIONAL: Stimme für die Sprachausgabe
 *                                Default: 'alloy'
 *                                Verfügbare Stimmen:
 *                                - 'alloy'   - Neutral, ausgewogen
 *                                - 'echo'    - Warm, männlich
 *                                - 'fable'   - Expressiv, britisch
 *                                - 'onyx'    - Tief, autoritär
 *                                - 'nova'    - Freundlich, weiblich
 *                                - 'shimmer' - Sanft, klar
 *
 * @param {string} language     - OPTIONAL: Sprache für die Aussprache (BCP-47)
 *                                Default: 'de-DE'
 *                                Beispiele: 'de-DE', 'en-US', 'en-GB', 'fr-FR', 'es-ES'
 *                                Hinweis: Beeinflusst Aussprache, nicht den Text
 *
 * @param {number} speed        - OPTIONAL: Sprechgeschwindigkeit
 *                                Default: 1.0
 *                                Bereich: 0.25 bis 4.0
 *                                - 0.25: Sehr langsam (4x langsamer)
 *                                - 0.5:  Langsam (2x langsamer)
 *                                - 1.0:  Normal
 *                                - 1.5:  Schnell (1.5x schneller)
 *                                - 2.0:  Sehr schnell (2x schneller)
 *
 * Rückgabe:
 * ---------
 * @returns {Promise<{ audio: Buffer, contentType: string }>}
 *   - audio: Audio-Daten als Buffer (MP3-Format)
 *   - contentType: MIME-Typ ('audio/mp3')
 *
 * Beispiele:
 * ----------
 * // Minimal
 * const result = await session.tts({ text: 'Hallo Welt' });
 *
 * // Mit Stimme
 * const result = await session.tts({
 *   text: 'Guten Tag!',
 *   voice: 'nova'
 * });
 *
 * // Vollständig
 * const result = await session.tts({
 *   text: 'Welcome to our service.',
 *   voice: 'echo',
 *   language: 'en-US',
 *   speed: 1.25
 * });
 *
 * // Audio speichern
 * await fs.writeFile('output.mp3', result.audio);
 * ============================================================================
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main() {
  console.log('🧪 IVU Voice API - TTS (Text-to-Speech) API Demo\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession();
    console.log('✅ Verbunden mit IVU KI API Server\n');

    // Output-Verzeichnis
    const outputDir = path.join(__dirname, '../output');
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch {
      // Verzeichnis existiert bereits
    }

    // ===================================================================
    // BEISPIEL 1: Einfache Sprachausgabe (Deutsch)
    // ===================================================================
    console.log('[Demo 1] TTS - Deutsche Sprachausgabe');
    console.log('─'.repeat(60));

    const germanText = 'Guten Tag! Willkommen beim IVU Voice API Workshop. Heute lernen Sie, wie Sie Sprache synthetisieren können.';
    console.log(`Text: "${germanText}"\n`);

    const result1 = await session.tts({
      text: germanText,        // REQUIRED: Text der gesprochen werden soll
      voice: 'alloy',          // OPTIONAL: Stimme (default: 'alloy')
      language: 'de-DE'        // OPTIONAL: Sprache (default: 'de-DE')
      // speed: 1.0            // OPTIONAL: Geschwindigkeit 0.25-4.0 (default: 1.0)
    });

    console.log(`✅ Audio generiert: ${result1.audio.length} Bytes`);
    console.log(`   Format: ${result1.contentType}`);

    // Audio speichern
    const file1 = path.join(outputDir, 'tts-demo-1-german.mp3');
    await fs.writeFile(file1, result1.audio);
    console.log(`   Gespeichert: ${file1}\n`);

    // ===================================================================
    // BEISPIEL 2: Verschiedene Stimmen testen
    // ===================================================================
    console.log('[Demo 2] TTS - Verschiedene Stimmen');
    console.log('─'.repeat(60));

    const voiceTestText = 'Dies ist ein Test verschiedener Stimmen.';
    // Alle verfügbaren TTS Stimmen:
    // - alloy:   Neutral, ausgewogen (gut für sachliche Texte)
    // - echo:    Warm, männlich klingend
    // - fable:   Expressiv, leicht britisch
    // - onyx:    Tief, autoritär
    // - nova:    Freundlich, weiblich klingend (gut für Kundenservice)
    // - shimmer: Sanft, klar
    const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

    console.log(`Text: "${voiceTestText}"\n`);

    for (const voice of voices) {
      try {
        const result = await session.tts({
          text: voiceTestText,
          voice: voice,
          language: 'de-DE'
        });

        const filename = path.join(outputDir, `tts-demo-2-voice-${voice}.mp3`);
        await fs.writeFile(filename, result.audio);
        console.log(`   ✓ Voice "${voice}": ${result.audio.length} Bytes → ${filename}`);
      } catch (error) {
        console.log(`   ✗ Voice "${voice}": Fehler - ${error instanceof Error ? error.message : 'Unbekannt'}`);
      }
    }
    console.log('');

    // ===================================================================
    // BEISPIEL 3: Verschiedene Geschwindigkeiten
    // ===================================================================
    console.log('[Demo 3] TTS - Verschiedene Geschwindigkeiten');
    console.log('─'.repeat(60));

    const speedTestText = 'Die Geschwindigkeit der Sprachausgabe kann angepasst werden.';
    // Geschwindigkeitsbereich: 0.25 (sehr langsam) bis 4.0 (sehr schnell)
    // Empfohlene Werte:
    // - 0.75: Langsamer (gut für komplexe Informationen wie Zahlen)
    // - 1.0:  Normal (Standard)
    // - 1.25: Leicht schneller (gut für bekannte Informationen)
    // - 1.5:  Schnell (gut für erfahrene Nutzer)
    const speeds = [0.75, 1.0, 1.25, 1.5];

    console.log(`Text: "${speedTestText}"\n`);

    for (const speed of speeds) {
      const result = await session.tts({
        text: speedTestText,
        voice: 'alloy',
        language: 'de-DE',
        speed: speed
      });

      const filename = path.join(outputDir, `tts-demo-3-speed-${speed}.mp3`);
      await fs.writeFile(filename, result.audio);
      console.log(`   ✓ Speed ${speed}x: ${result.audio.length} Bytes → ${filename}`);
    }
    console.log('');

    // ===================================================================
    // BEISPIEL 4: Englische Sprachausgabe
    // ===================================================================
    console.log('[Demo 4] TTS - Englische Sprachausgabe');
    console.log('─'.repeat(60));

    const englishText = 'Hello! Welcome to the IVU Voice API Workshop. Today you will learn how to synthesize speech.';
    console.log(`Text: "${englishText}"\n`);

    // Unterstützte Sprachen (Auszug):
    // - de-DE: Deutsch (Deutschland)
    // - en-US: Englisch (USA)
    // - en-GB: Englisch (UK)
    // - fr-FR: Französisch
    // - es-ES: Spanisch
    // - it-IT: Italienisch
    // - pt-BR: Portugiesisch (Brasilien)
    // - nl-NL: Niederländisch
    // - pl-PL: Polnisch
    // - ja-JP: Japanisch
    // - ko-KR: Koreanisch
    // - zh-CN: Chinesisch (vereinfacht)
    const result4 = await session.tts({
      text: englishText,
      voice: 'echo',
      language: 'en-US'      // Sprache beeinflusst die Aussprache
    });

    const file4 = path.join(outputDir, 'tts-demo-4-english.mp3');
    await fs.writeFile(file4, result4.audio);
    console.log(`✅ Audio generiert: ${result4.audio.length} Bytes`);
    console.log(`   Gespeichert: ${file4}\n`);

    // ===================================================================
    // BEISPIEL 5: Längerer Text (Voice-Bot Antwort)
    // ===================================================================
    console.log('[Demo 5] TTS - Voice-Bot Antwort');
    console.log('─'.repeat(60));

    const botResponse = `Vielen Dank für Ihren Anruf bei den Stadtwerken.
    Ihr aktueller Zählerstand von fünftausenddreihundertzweiundzwanzig Kilowattstunden wurde erfolgreich gespeichert.
    Falls Sie Fragen haben, können Sie uns jederzeit unter der Servicenummer null acht hundert eins zwei drei vier fünf erreichen.
    Auf Wiederhören!`;

    console.log(`Bot-Antwort: "${botResponse.substring(0, 80)}..."\n`);

    // Tipp: Für Voice-Bots empfohlen:
    // - voice: 'nova' (freundlich, klar) oder 'alloy' (neutral)
    // - speed: 1.0 oder 0.9 (leicht langsamer für besseres Verständnis)
    // - Zahlen als Wörter schreiben: "12345" → "eins zwei drei vier fünf"
    const result5 = await session.tts({
      text: botResponse,
      voice: 'nova',           // Freundliche Stimme für Kundenservice
      language: 'de-DE',
      speed: 1.0               // Normale Geschwindigkeit
    });

    const file5 = path.join(outputDir, 'tts-demo-5-bot-response.mp3');
    await fs.writeFile(file5, result5.audio);
    console.log(`✅ Audio generiert: ${result5.audio.length} Bytes`);
    console.log(`   Gespeichert: ${file5}\n`);

    // ===================================================================
    // ZUSAMMENFASSUNG
    // ===================================================================
    console.log('='.repeat(60));
    console.log('✅ TTS-API Demo erfolgreich abgeschlossen!\n');
    console.log('💡 Was Sie gelernt haben:');
    console.log('   ✓ tts() API für Text-zu-Sprache Konvertierung');
    console.log('   ✓ Verschiedene Stimmen (alloy, echo, fable, onyx, nova, shimmer)');
    console.log('   ✓ Anpassbare Geschwindigkeit (0.25 - 4.0)');
    console.log('   ✓ Mehrsprachigkeit (de-DE, en-US, etc.)');
    console.log('');
    console.log('📁 Generierte Audio-Dateien:');
    console.log(`   ${outputDir}/`);
    console.log('');
    console.log('📝 Für Voice-Bots:');
    console.log('   Typischer Workflow:');
    console.log('   1. chat() für KI-Antwort generieren');
    console.log('   2. tts() für Audio-Ausgabe');
    console.log('   3. Audio an den Anrufer abspielen');
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
