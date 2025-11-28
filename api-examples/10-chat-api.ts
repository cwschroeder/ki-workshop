/**
 * Test 10 - Chat API Demo
 *
 * Demonstriert die Verwendung der chat() API für einfache Text-basierte KI-Anfragen.
 */

import 'dotenv/config';
import { createVoiceSession } from './lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Chat API Demo\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession();
    console.log('✅ Verbunden mit IVU KI API Server\n');

    // ===================================================================
    // BEISPIEL 1: Einfache Frage
    // ===================================================================
    console.log('[Demo 1] Chat API - Einfache Frage');
    console.log('─'.repeat(60));
    console.log('Frage: Was ist die Hauptstadt von Thailand?');

    const response1 = await session.chat({
      userMessage: 'Was ist die Hauptstadt von Thailand?'
    });

    console.log('Antwort:', response1.aiResponse);
    console.log('');

    // ===================================================================
    // BEISPIEL 2: Mit System Prompt
    // ===================================================================
    console.log('[Demo 2] Chat API - Mit System Prompt');
    console.log('─'.repeat(60));
    console.log('Frage: Erkläre mir Photosynthese');

    const response2 = await session.chat({
      userMessage: 'Erkläre mir Photosynthese',
      systemPrompt: 'Du bist ein freundlicher Biologielehrer. Erkläre Konzepte kurz und verständlich für Schüler.'
    });

    console.log('Antwort:', response2.aiResponse);
    console.log('');

    // ===================================================================
    // BEISPIEL 3: Mit Temperature-Einstellung
    // ===================================================================
    console.log('[Demo 3] Chat API - Kreative Antwort (hohe Temperature)');
    console.log('─'.repeat(60));
    console.log('Frage: Erzähl mir einen kurzen Witz über Programmierer');

    const response3 = await session.chat({
      userMessage: 'Erzähl mir einen kurzen Witz über Programmierer',
      temperature: 0.9  // Höhere Temperature = kreativer
    });

    console.log('Antwort:', response3.aiResponse);
    console.log('');

    // ===================================================================
    // BEISPIEL 4: Präzise Antwort (niedrige Temperature)
    // ===================================================================
    console.log('[Demo 4] Chat API - Präzise Antwort (niedrige Temperature)');
    console.log('─'.repeat(60));
    console.log('Frage: Was ist 2 + 2?');

    const response4 = await session.chat({
      userMessage: 'Was ist 2 + 2?',
      temperature: 0.1  // Niedrige Temperature = deterministischer
    });

    console.log('Antwort:', response4.aiResponse);
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ Chat-API Demo erfolgreich abgeschlossen!\n');
    console.log('💡 Was Sie gelernt haben:');
    console.log('   ✓ chat() API für einfache Text-basierte KI-Anfragen');
    console.log('   ✓ System Prompts zur Steuerung des KI-Verhaltens');
    console.log('   ✓ Temperature-Einstellung für Kreativität vs. Präzision');
    console.log('');
    console.log('📝 Für Voice-Bots:');
    console.log('   Um diese API in einem Voice-Bot zu nutzen, würden Sie:');
    console.log('   1. collectSpeech() verwenden → Text vom Benutzer');
    console.log('   2. chat() aufrufen → KI-Antwort generieren');
    console.log('   3. say() verwenden → Antwort vorlesen');
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
