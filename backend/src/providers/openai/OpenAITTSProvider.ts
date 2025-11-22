import { OpenAI } from 'openai';
import { spawn } from 'child_process';
import { TTSProvider } from '../TTSProvider';
import { logger } from '../../utils/logger';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * OpenAI Text-to-Speech Provider
 */
export class OpenAITTSProvider implements TTSProvider {
  private openai: OpenAI;
  private model: string;
  private voice: string;

  constructor(apiKey: string, model: string = 'tts-1', voice: string = 'nova') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
    this.voice = voice;
  }

  async synthesize(text: string, _language: string): Promise<Buffer> {
    try {
      // Generate speech with OpenAI TTS
      const mp3Response = await this.openai.audio.speech.create({
        model: this.model,
        voice: this.voice as any,
        input: text,
        speed: 1.0,
      });

      const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer());

      // Convert MP3 to telephony-compatible PCM (8kHz, mono, 16-bit)
      const pcmBuffer = await this.convertToTelephonyPCM(mp3Buffer);

      return pcmBuffer;
    } catch (error) {
      logger.error({ error }, 'OpenAI TTS synthesis failed');
      throw error;
    }
  }

  getAudioFormat() {
    return {
      sampleRate: 8000,
      channels: 1,
      bitDepth: 16,
    };
  }

  getName(): string {
    return `OpenAI TTS (${this.voice})`;
  }

  /**
   * Convert MP3 to PCM format suitable for telephony
   * Uses ffmpeg to convert to 8kHz, mono, 16-bit PCM
   */
  private async convertToTelephonyPCM(mp3Buffer: Buffer): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const mp3Path = path.join(tmpDir, `tts_${Date.now()}.mp3`);
    const pcmPath = path.join(tmpDir, `tts_${Date.now()}.pcm`);

    try {
      // Write MP3 to temp file
      await writeFile(mp3Path, mp3Buffer);

      // Convert using ffmpeg
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', mp3Path,
          '-f', 's16le',        // Signed 16-bit little-endian PCM
          '-acodec', 'pcm_s16le',
          '-ar', '8000',        // 8kHz sample rate
          '-ac', '1',           // Mono
          '-y',                 // Overwrite
          pcmPath
        ]);

        let stderr = '';
        ffmpeg.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        ffmpeg.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            logger.error({ code, stderr }, 'ffmpeg conversion failed');
            reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
          }
        });

        ffmpeg.on('error', (err) => {
          logger.error({ error: err }, 'ffmpeg spawn error');
          reject(err);
        });
      });

      // Read PCM file
      const fs = await import('fs/promises');
      const pcmBuffer = await fs.readFile(pcmPath);

      // Cleanup temp files
      await unlink(mp3Path).catch(() => {});
      await unlink(pcmPath).catch(() => {});

      return pcmBuffer;
    } catch (error) {
      // Cleanup on error
      await unlink(mp3Path).catch(() => {});
      await unlink(pcmPath).catch(() => {});
      throw error;
    }
  }
}
