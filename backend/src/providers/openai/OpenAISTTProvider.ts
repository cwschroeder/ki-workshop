import { OpenAI } from 'openai';
import { STTProvider } from '../STTProvider';
import { logger } from '../../utils/logger';

/**
 * OpenAI Whisper Speech-to-Text Provider
 */
export class OpenAISTTProvider implements STTProvider {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async transcribe(
    audioBuffer: Buffer,
    sampleRate: number,
    language: string
  ): Promise<string> {
    try {
      // Convert PCM to WAV format for Whisper
      const wavBuffer = this.pcmToWav(audioBuffer, sampleRate);

      const transcription = await this.openai.audio.transcriptions.create({
        file: new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }),
        model: 'whisper-1',
        language,
        response_format: 'text',
      });

      return transcription as unknown as string;
    } catch (error) {
      logger.error({ error }, 'OpenAI STT transcription failed');
      return '';
    }
  }

  getName(): string {
    return 'OpenAI Whisper';
  }

  /**
   * Convert PCM to WAV format
   */
  private pcmToWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
    const numChannels = 1; // Mono
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmBuffer.length;

    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }
}
