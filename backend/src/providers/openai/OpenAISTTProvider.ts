import { File } from 'node:buffer';
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

      // Pass 1: Initial transcription with domain vocabulary
      const transcription1 = await this.openai.audio.transcriptions.create({
        file: new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }),
        model: 'whisper-1',
        language,
        // Use verbose JSON so we can inspect confidence and filter bad segments
        response_format: 'verbose_json',
        // Temperature 0 for deterministic decoding (reduces hallucinations)
        temperature: 0,
        // Domain vocabulary (shorter, no instructions to avoid prompt leakage)
        prompt: 'Zählerstand, Zählernummer, Kundennummer, Stadtwerk'
      });

      const pass1Result = this.cleanTranscript(transcription1 as WhisperVerboseJson);

      // Pass 2: Refine if numbers detected (improves digit accuracy)
      if (this.containsDigits(pass1Result)) {
        logger.debug({ pass1: pass1Result }, 'STT: Pass 1 contains digits, refining with Pass 2');

        const transcription2 = await this.openai.audio.transcriptions.create({
          file: new File([wavBuffer], 'audio.wav', { type: 'audio/wav' }),
          model: 'whisper-1',
          language,
          response_format: 'verbose_json',
          temperature: 0,
          // Use Pass 1 as context for refinement
          prompt: `${pass1Result}`
        });

        const pass2Result = this.cleanTranscript(transcription2 as WhisperVerboseJson);
        logger.debug({ pass1: pass1Result, pass2: pass2Result }, 'STT: 2-Pass refinement complete');

        return pass2Result;
      }

      return pass1Result;
    } catch (error) {
      logger.error({ error }, 'OpenAI STT transcription failed');
      return '';
    }
  }

  getName(): string {
    return 'OpenAI Whisper';
  }

  /**
   * Check if text contains digits (numbers)
   */
  private containsDigits(text: string): boolean {
    return /\d/.test(text);
  }

  /**
   * Clean Whisper verbose JSON output:
   * - Filter out low-confidence segments
   * - Normalize whitespace and common number confusions (O→0, l→1, etc.)
   */
  private cleanTranscript(result: WhisperVerboseJson): string {
    if (!result) return '';

    const segments = result.segments || [];

    const acceptedSegments = segments.filter((segment) => this.isSegmentTrusted(segment));
    const textSource = acceptedSegments.length > 0
      ? acceptedSegments.map((s) => s.text).join(' ')
      : result.text || '';

    return this.normalizeNumbersAndWhitespace(textSource);
  }

  private isSegmentTrusted(segment: WhisperSegment): boolean {
    const avgLogprob = segment.avg_logprob ?? 0;
    const noSpeechProb = segment.no_speech_prob ?? 0;
    const compressionRatio = segment.compression_ratio ?? 0;

    // Relaxed heuristics for telephone audio quality (8kHz G.711)
    // These thresholds are more permissive to avoid over-filtering legitimate speech
    const trusted = !(
      avgLogprob < -1.8 ||           // Was -1.2, now more permissive for phone audio
      noSpeechProb > 0.8 ||          // Was 0.6, only reject very high silence probability
      compressionRatio > 3.5         // Was 2.4, allow more repetition before filtering
    );

    // Debug logging to understand actual confidence scores
    if (!trusted) {
      logger.debug({
        text: segment.text,
        avgLogprob: avgLogprob.toFixed(3),
        noSpeechProb: noSpeechProb.toFixed(3),
        compressionRatio: compressionRatio.toFixed(2),
        rejected: true
      }, 'STT: Segment rejected by confidence filter');
    }

    return trusted;
  }

  private normalizeNumbersAndWhitespace(text: string): string {
    const trimmed = text.replace(/\s+/g, ' ').trim();

    // Replace common letter→digit confusions, but only on tokens that already contain digits
    return trimmed.replace(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+\b/g, (token) => {
      return token
        .replace(/[oO]/g, '0')
        .replace(/[lI|]/g, '1')
        .replace(/B/g, '8')
        .replace(/S/g, '5');
    });
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

interface WhisperVerboseJson {
  text: string;
  segments?: WhisperSegment[];
}

interface WhisperSegment {
  text: string;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}
