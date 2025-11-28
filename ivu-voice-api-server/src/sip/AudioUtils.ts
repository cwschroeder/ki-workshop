import { spawn } from 'child_process';

/**
 * Audio Utility Functions
 *
 * Handles conversion between different audio formats:
 * - PCM 8kHz (telephony) ↔ WAV (for STT providers)
 * - MP3/WAV (from TTS providers) → PCM 8kHz (for RTP)
 */

/**
 * Convert raw PCM to WAV format
 * Required for STT providers that expect WAV input
 *
 * @param pcmData - Raw 16-bit signed PCM data (little-endian)
 * @param sampleRate - Sample rate in Hz (typically 8000 for telephony)
 * @returns WAV buffer with proper headers
 */
export function pcmToWav(pcmData: Buffer, sampleRate: number = 8000): Buffer {
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  // WAV header is 44 bytes
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + pcmData.length);

  // RIFF header
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmData.length, 4); // File size - 8
  wavBuffer.write('WAVE', 8);

  // fmt subchunk
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  wavBuffer.writeUInt16LE(numChannels, 22); // NumChannels
  wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
  wavBuffer.writeUInt32LE(byteRate, 28); // ByteRate
  wavBuffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  wavBuffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

  // data subchunk
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmData.length, 40); // Subchunk2Size

  // Copy PCM data
  pcmData.copy(wavBuffer, headerSize);

  return wavBuffer;
}

/**
 * Convert WAV to raw PCM
 * Extracts the raw audio data from a WAV file
 *
 * @param wavData - WAV file buffer
 * @returns Raw PCM buffer and sample rate
 */
export function wavToPcm(wavData: Buffer): { pcm: Buffer; sampleRate: number } {
  // Validate RIFF header
  if (wavData.toString('utf8', 0, 4) !== 'RIFF') {
    throw new Error('Invalid WAV file: missing RIFF header');
  }

  if (wavData.toString('utf8', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV file: missing WAVE format');
  }

  // Find fmt chunk
  let offset = 12;
  let sampleRate = 8000;

  while (offset < wavData.length - 8) {
    const chunkId = wavData.toString('utf8', offset, offset + 4);
    const chunkSize = wavData.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      sampleRate = wavData.readUInt32LE(offset + 12);
    } else if (chunkId === 'data') {
      const pcm = wavData.slice(offset + 8, offset + 8 + chunkSize);
      return { pcm, sampleRate };
    }

    offset += 8 + chunkSize;
  }

  throw new Error('Invalid WAV file: missing data chunk');
}

/**
 * Convert MP3 to PCM 8kHz mono using ffmpeg
 * Required for converting TTS output to telephony format
 *
 * @param mp3Data - MP3 audio buffer
 * @returns PCM 8kHz 16-bit mono buffer
 */
export async function mp3ToPcm8k(mp3Data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i',
      'pipe:0', // Input from stdin
      '-f',
      's16le', // Output format: signed 16-bit little-endian
      '-acodec',
      'pcm_s16le', // Codec
      '-ar',
      '8000', // Sample rate
      '-ac',
      '1', // Mono
      'pipe:1' // Output to stdout
    ]);

    const chunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stderr.on('data', (data: Buffer) => {
      // FFmpeg outputs progress to stderr, ignore unless debugging
      // console.debug('[ffmpeg]', data.toString());
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg error: ${err.message}`));
    });

    // Write MP3 data to ffmpeg stdin
    ffmpeg.stdin.write(mp3Data);
    ffmpeg.stdin.end();
  });
}

/**
 * Convert any audio format to PCM 8kHz mono using ffmpeg
 * Auto-detects input format
 *
 * @param audioData - Audio buffer (MP3, WAV, OGG, etc.)
 * @returns PCM 8kHz 16-bit mono buffer
 */
export async function audioToPcm8k(audioData: Buffer): Promise<Buffer> {
  return mp3ToPcm8k(audioData); // ffmpeg auto-detects input format
}

/**
 * Resample PCM audio to different sample rate using ffmpeg
 *
 * @param pcmData - Raw PCM 16-bit mono buffer
 * @param fromRate - Source sample rate
 * @param toRate - Target sample rate
 * @returns Resampled PCM buffer
 */
export async function resamplePcm(
  pcmData: Buffer,
  fromRate: number,
  toRate: number
): Promise<Buffer> {
  if (fromRate === toRate) {
    return pcmData;
  }

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f',
      's16le', // Input format
      '-ar',
      fromRate.toString(), // Input sample rate
      '-ac',
      '1', // Input channels (mono)
      '-i',
      'pipe:0', // Input from stdin
      '-f',
      's16le', // Output format
      '-ar',
      toRate.toString(), // Output sample rate
      '-ac',
      '1', // Output channels (mono)
      'pipe:1' // Output to stdout
    ]);

    const chunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg resampling exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg error: ${err.message}`));
    });

    ffmpeg.stdin.write(pcmData);
    ffmpeg.stdin.end();
  });
}

/**
 * Calculate audio duration in milliseconds
 *
 * @param pcmData - Raw PCM 16-bit buffer
 * @param sampleRate - Sample rate in Hz
 * @returns Duration in milliseconds
 */
export function getAudioDurationMs(pcmData: Buffer, sampleRate: number = 8000): number {
  const samples = pcmData.length / 2; // 16-bit = 2 bytes per sample
  return (samples / sampleRate) * 1000;
}

/**
 * Calculate RMS (Root Mean Square) energy level
 * Useful for VAD (Voice Activity Detection)
 *
 * @param pcmData - Raw PCM 16-bit buffer
 * @returns RMS value normalized to 0-1 range
 */
export function calculateRms(pcmData: Buffer): number {
  let sumSquares = 0;
  const numSamples = pcmData.length / 2;

  for (let i = 0; i < pcmData.length; i += 2) {
    const sample = pcmData.readInt16LE(i);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / numSamples);
  return rms / 32768; // Normalize to 0-1
}

/**
 * Convert RMS to decibels
 *
 * @param rms - RMS value (0-1 normalized)
 * @returns Decibel value (negative, where 0 dB = max volume)
 */
export function rmsToDb(rms: number): number {
  if (rms <= 0) return -100;
  return 20 * Math.log10(rms);
}
