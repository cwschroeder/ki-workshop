/**
 * Test 10 - Chat API Demo
 *
 * Demonstriert die Verwendung der chat() API für KI-gestützte Konversationen.
 * Die chat() API kombiniert Spracheingabe, KI-Verarbeitung und TTS-Ausgabe.
 */

import 'dotenv/config';
import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🧪 IVU Voice API - Chat API Demo\n');
  console.log('='.repeat(60));

  try {
    const session = await createVoiceSession();
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
    console.log('🎉 Chat-API-Test bereit!');
    console.log('='.repeat(60));
    console.log('\n💡 Rufen Sie jetzt an:', phoneNumber);
    console.log('\n📋 Test-Ablauf:');
    console.log('   1. Willkommensnachricht');
    console.log('   2. KI sammelt Ihren Namen');
    console.log('   3. KI fragt nach Ihrer Lieblingsfarbe');
    console.log('   4. KI fasst Ihre Eingaben zusammen\n');
    console.log('⏳ Warte auf Anrufe...\n');

    session.on('call.incoming', async (call) => {
      console.log('\n' + '🔔 '.repeat(30));
      console.log('📞 EINGEHENDER ANRUF!');
      console.log('🔔 '.repeat(30));
      console.log('\n📋 Anruf Details:');
      console.log('   Anruf ID:', call.callId);
      console.log('   Zeit:', new Date().toLocaleString('de-DE'));

      try {
        console.log('\n▶️  Starte Chat-API Demo...\n');

        // Begrüßung
        await call.say('Willkommen zur Chat-API Demo.');

        // ===================================================================
        // CHAT API BEISPIEL 1: Name erfragen
        // ===================================================================
        console.log('\n[Demo 1] Chat API - Name erfragen');
        console.log('─'.repeat(60));

        const nameResponse = await call.chat({
          collectSpeech: true,  // Sammelt Spracheingabe
          systemPrompt: `Du bist ein freundlicher Assistent.
Frage den Benutzer nach seinem Namen und antworte kurz und höflich.
Wenn der Benutzer seinen Namen nennt, bedanke dich und verwende den Namen in der Antwort.`,
          temperature: 0.7,     // Kreativität (0.0 - 1.0)
          maxTokens: 100        // Maximale Antwortlänge
        });

        console.log('   KI-Antwort:', nameResponse.aiResponse);
        console.log('   Benutzer sagte:', nameResponse.userInput);
        console.log('');

        // ===================================================================
        // CHAT API BEISPIEL 2: Lieblingsfarbe erfragen
        // ===================================================================
        console.log('[Demo 2] Chat API - Lieblingsfarbe erfragen');
        console.log('─'.repeat(60));

        const colorResponse = await call.chat({
          collectSpeech: true,
          systemPrompt: `Du bist ein freundlicher Assistent.
Frage den Benutzer nach seiner Lieblingsfarbe.
Gib eine kurze, positive Reaktion auf die genannte Farbe.`,
          temperature: 0.8,
          maxTokens: 80
        });

        console.log('   KI-Antwort:', colorResponse.aiResponse);
        console.log('   Benutzer sagte:', colorResponse.userInput);
        console.log('');

        // ===================================================================
        // CHAT API BEISPIEL 3: Zusammenfassung generieren
        // ===================================================================
        console.log('[Demo 3] Chat API - Zusammenfassung');
        console.log('─'.repeat(60));

        const summaryResponse = await call.chat({
          collectSpeech: false,  // KEINE Spracheingabe
          userMessage: `Name: ${nameResponse.userInput}, Lieblingsfarbe: ${colorResponse.userInput}`,
          systemPrompt: `Du bist ein freundlicher Assistent.
Erstelle eine kurze, freundliche Zusammenfassung der genannten Informationen.
Verabschiede dich höflich.`,
          temperature: 0.7,
          maxTokens: 100
        });

        console.log('   KI-Antwort:', summaryResponse.aiResponse);
        console.log('');

        // ===================================================================
        // CHAT API BEISPIEL 4: Validierung mit Extraktion
        // ===================================================================
        console.log('[Demo 4] Chat API - Mit Validierung');
        console.log('─'.repeat(60));

        await call.say('Jetzt testen wir die Validierung. Sagen Sie bitte eine Zahl zwischen 1 und 100.');

        const validationResponse = await call.chat({
          collectSpeech: true,
          systemPrompt: `Du bist ein Assistent für Zahleneingaben.
Wenn der Benutzer eine Zahl nennt, bestätige sie.
Wenn keine Zahl erkannt wurde, frage höflich nach.`,
          temperature: 0.5,
          maxTokens: 80,
          validation: {
            type: 'number',  // Validierungstyp: 'number' | 'customer_id' | 'meter_reading'
            min: 1,          // Minimum (optional)
            max: 100         // Maximum (optional)
          }
        });

        console.log('   KI-Antwort:', validationResponse.aiResponse);
        console.log('   Benutzer sagte:', validationResponse.userInput);
        console.log('   Extrahierte Zahl:', validationResponse.extracted?.reading);
        console.log('   Validierung OK:', validationResponse.isValid);
        if (!validationResponse.isValid) {
          console.log('   Validierungsfehler:', validationResponse.validationError);
        }
        console.log('');

        // Verabschiedung
        await call.hangup('Auf Wiedersehen!');

        console.log('\n✅ Chat-API Demo erfolgreich abgeschlossen!\n');
        console.log('='.repeat(60));
        console.log('💡 Was Sie gelernt haben:');
        console.log('   ✓ chat() API für KI-gestützte Dialoge');
        console.log('   ✓ Spracheingabe sammeln (collectSpeech: true)');
        console.log('   ✓ KI-Antworten ohne Benutzereingabe generieren');
        console.log('   ✓ Validierung und Datenextraktion');
        console.log('');
        console.log('📝 Hinweis für Workshop-Teilnehmer:');
        console.log('   Diese API können Sie verwenden, um:');
        console.log('   • Einen Zählerstand-Bot zu entwickeln');
        console.log('   • Kundennummern zu erfragen und zu validieren');
        console.log('   • Zählerstände zu sammeln und zu speichern');
        console.log('   • Fehlerhafte Eingaben elegant zu behandeln');
        console.log('');
        console.log('💡 Weitere Funktionen in lib/ivu-voice-client.ts:');
        console.log('   • session.lookupCustomer(customerNumber)');
        console.log('   • session.saveMeterReading({ customerNumber, meterNumber, reading })');
        console.log('   • call.extractCustomerInfo(text)');
        console.log('');
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
