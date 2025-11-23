/**
 * Beispiel 4: KI-gestützte Konversation
 *
 * Natürlicher Dialog mit OpenAI GPT.
 * Das System führt eine freie Konversation und extrahiert dabei Informationen.
 *
 * Was Sie lernen:
 * - AI Conversation API nutzen
 * - System-Prompts schreiben
 * - Kontext über mehrere Turns
 * - Gesprächssteuerung mit [END_CALL]
 * - Informationen aus Konversation extrahieren
 */

import { createVoiceSession } from '../lib/ivu-voice-client';

async function main() {
  console.log('🎯 Beispiel 4: KI-Konversation');
  console.log('Starte Session...\n');

  const session = await createVoiceSession();

  session.on('call.incoming', async (call) => {
    console.log('📞 Anruf eingehend!');
    console.log('🤖 KI-Agent übernimmt...\n');

    try {
      // System-Prompt definiert das Verhalten der KI
      const systemPrompt = `Du bist Anna, eine freundliche Mitarbeiterin beim Stadtwerk.

Deine Aufgabe:
1. Begrüße den Kunden herzlich
2. Frage nach der Kundennummer
3. Frage nach der Zählernummer
4. Frage nach dem aktuellen Zählerstand
5. Wiederhole die Angaben zur Bestätigung
6. Bedanke dich und beende das Gespräch mit [END_CALL]

Regeln:
- Sei freundlich und hilfsbereit
- Stelle immer nur EINE Frage pro Antwort
- Wenn etwas unklar ist, frage höflich nach
- Antworte kurz und präzise (max. 2 Sätze)
- Spreche auf Deutsch
- Am Ende: Füge [END_CALL] in deine letzte Nachricht ein

Beispiel-Dialog:
Anna: "Guten Tag! Hier ist Anna vom Stadtwerk. Wie kann ich Ihnen helfen?"
Kunde: "Ich möchte meinen Zählerstand melden."
Anna: "Sehr gerne! Können Sie mir bitte Ihre Kundennummer nennen?"
Kunde: "12345"
Anna: "Vielen Dank. Und wie lautet Ihre Zählernummer?"
...
`;

      // KI-Konversation starten
      const result = await call.aiConversation({
        systemPrompt,
        maxTurns: 10 // Max. 10 Gesprächsrunden
      });

      console.log('\n📝 Gesprächs-Zusammenfassung:');
      console.log(`   Anzahl Turns: ${result.turnCount}`);
      console.log(`   Nachrichten: ${result.messages.length}`);

      // Informationen aus Konversation extrahieren
      console.log('\n🔍 Extrahiere Informationen...');

      const userMessages = result.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join(' ');

      const extractedInfo = await call.extractCustomerInfo(userMessages);

      console.log('\n✅ Extrahierte Daten:');
      console.log(`   Kundennummer: ${extractedInfo.customerNumber || 'nicht gefunden'}`);
      console.log(`   Zählernummer: ${extractedInfo.meterNumber || 'nicht gefunden'}`);
      console.log(`   Zählerstand: ${extractedInfo.reading || 'nicht gefunden'}`);

      // Optional: Daten speichern
      if (extractedInfo.customerNumber && extractedInfo.meterNumber && extractedInfo.reading) {
        await session.saveMeterReading({
          customerNumber: extractedInfo.customerNumber,
          meterNumber: extractedInfo.meterNumber,
          reading: extractedInfo.reading,
          timestamp: new Date()
        });
        console.log('\n💾 Zählerstand gespeichert!');
      }

      console.log('\n✅ Anruf beendet');
    } catch (error) {
      console.error('❌ Fehler:', error);
      await call.hangup('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.');
    }
  });

  session.on('call.ended', (callId) => {
    console.log(`📵 Anruf ${callId} beendet`);
  });

  await session.start();

  console.log('✅ Session gestartet');
  console.log('💡 Rufen Sie an und unterhalten Sie sich mit der KI!\n');
  console.log('Tipps:');
  console.log('- Sprechen Sie natürlich, wie mit einem Menschen');
  console.log('- Die KI versteht auch umgangssprachliche Antworten');
  console.log('- Wenn Sie etwas falsch verstanden wurde, korrigieren Sie es einfach');
  console.log('- Die KI führt durch das Gespräch\n');
  console.log('Drücken Sie Ctrl+C zum Beenden');
}

main().catch(console.error);

/**
 * AUFGABEN:
 * 1. Ändern Sie den System-Prompt für ein anderes Szenario:
 *    - Pizza-Bestellung
 *    - Termin-Buchung
 *    - Produkt-Support
 *
 * 2. Experimentieren Sie mit verschiedenen Persönlichkeiten:
 *    - Sehr formell
 *    - Locker und witzig
 *    - Technisch präzise
 *
 * 3. Fügen Sie Validierung hinzu:
 *    - Prüfen Sie ob Kundennummer existiert
 *    - Warnen Sie bei unrealistischen Zählerständen
 *
 * 4. Was passiert wenn die KI [END_CALL] vergisst?
 *    Wie können Sie das Gespräch trotzdem beenden?
 */
