import OpenAI from 'openai';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'OpenAIService' });

export class OpenAIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
  }

  /**
   * Convert speech to text using Whisper
   */
  async transcribeAudio(audioBuffer: Buffer, callId: string): Promise<string> {
    try {
      logger.debug({ callId }, 'Transcribing audio with Whisper');

      const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

      const transcription = await this.client.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'de'
      });

      logger.debug(
        { callId, transcription: transcription.text },
        'Audio transcribed successfully'
      );

      return transcription.text;
    } catch (error) {
      logger.error({ callId, error }, 'Failed to transcribe audio');
      throw new Error('Transcription failed');
    }
  }

  /**
   * Generate conversational response using GPT-4
   */
  async generateResponse(
    conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    callId: string
  ): Promise<string> {
    try {
      logger.debug({ callId, messageCount: conversationHistory.length }, 'Generating GPT-4 response');

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: conversationHistory,
        temperature: 0.7,
        max_tokens: 150
      });

      const response = completion.choices[0]?.message?.content || '';

      logger.debug({ callId, response }, 'GPT-4 response generated');

      return response;
    } catch (error) {
      logger.error({ callId, error }, 'Failed to generate GPT-4 response');
      throw new Error('Response generation failed');
    }
  }

  /**
   * Convert text to speech using TTS
   */
  async synthesizeSpeech(text: string, callId: string): Promise<Buffer> {
    try {
      logger.debug({ callId, text }, 'Synthesizing speech with TTS');

      const mp3 = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: text,
        response_format: 'mp3'
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      logger.debug({ callId, bufferSize: buffer.length }, 'Speech synthesized successfully');

      return buffer;
    } catch (error) {
      logger.error({ callId, error }, 'Failed to synthesize speech');
      throw new Error('Speech synthesis failed');
    }
  }

  /**
   * Extract numeric value from text (for customer number, meter number, reading)
   */
  async extractNumber(userInput: string, context: string, callId: string): Promise<string | null> {
    try {
      const systemPrompt = `Du bist ein Assistent, der Zahlen aus gesprochenem Text extrahiert.
Kontext: ${context}
Extrahiere die relevante Zahl oder Nummer aus der Benutzereingabe.
Wenn keine klare Nummer erkennbar ist, antworte mit "unclear".
Gib nur die extrahierte Nummer zurück, ohne zusätzlichen Text.`;

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ],
        temperature: 0.3,
        max_tokens: 50
      });

      const extracted = completion.choices[0]?.message?.content?.trim() || '';

      if (extracted.toLowerCase() === 'unclear' || extracted === '') {
        logger.debug({ callId, userInput, context }, 'Could not extract number from input');
        return null;
      }

      logger.debug({ callId, userInput, extracted }, 'Number extracted successfully');
      return extracted;
    } catch (error) {
      logger.error({ callId, error }, 'Failed to extract number');
      return null;
    }
  }
}
