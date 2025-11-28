/**
 * DTLN (Dual-Signal Transformation LSTM Network) Provider
 *
 * Uses @hayatialikeles/dtln-rs for real-time noise suppression.
 * DTLN is a lightweight deep learning model specifically designed for
 * real-time speech enhancement.
 *
 * Advantages over RNNoise:
 * - Works at 16kHz (closer to telephony 8kHz, less resampling artifacts)
 * - More modern LSTM-based architecture
 * - Better handling of non-stationary noise
 * - 55x faster than real-time
 *
 * @see https://github.com/breizhn/DTLN
 * @see https://github.com/hayatialikeles/dtln-rs
 */

import type { IDenoiserProvider, DenoiserOptions } from '../IDenoiserProvider';

// Type for libsamplerate-js
interface SRC {
  simple(input: Float32Array, ratio: number, nChannels: number): Float32Array;
  destroy(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LibSampleRateModule = any;

// Converter type enum values from libsamplerate
type ConverterType = 0 | 1 | 2 | 3 | 4;

export type ResamplerQuality = 'low' | 'medium' | 'high';

const QUALITY_TO_CONVERTER: Record<ResamplerQuality, ConverterType> = {
  low: 4, // SRC_LINEAR
  medium: 2, // SRC_SINC_FASTEST
  high: 1 // SRC_SINC_MEDIUM_QUALITY
};

export interface DTLNProviderOptions {
  /**
   * Resampling quality (affects CPU usage and audio quality)
   * - 'low': Fastest, lowest quality
   * - 'medium': Good balance (default)
   * - 'high': Best quality, slower
   */
  quality?: ResamplerQuality;
}

// DTLN native module types
interface DTLNModule {
  dtln_create(): number; // Returns handle
  dtln_denoise(handle: number, input: Float32Array, output: Float32Array): boolean;
  dtln_stop(handle: number): void;
}

export class DTLNProvider implements IDenoiserProvider {
  readonly name = 'dtln';
  readonly requiredSampleRate = 16000; // DTLN requires 16kHz

  private _initialized = false;
  private dtlnModule: DTLNModule | null = null;
  private denoiserHandle: number = 0;
  private upsampler: SRC | null = null;
  private downsampler: SRC | null = null;
  private quality: ResamplerQuality;

  // Constants
  private readonly INPUT_SAMPLE_RATE = 8000;
  private readonly DTLN_SAMPLE_RATE = 16000;
  private readonly DTLN_FRAME_SIZE = 512; // Recommended frame size (32ms @ 16kHz)
  private readonly UPSAMPLE_RATIO = this.DTLN_SAMPLE_RATE / this.INPUT_SAMPLE_RATE; // 2

  constructor(options: DTLNProviderOptions = {}) {
    this.quality = options.quality ?? 'medium';
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      // Load DTLN native module
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.dtlnModule = require('@hayatialikeles/dtln-rs') as DTLNModule;

      // Create denoiser instance
      this.denoiserHandle = this.dtlnModule.dtln_create();
      if (this.denoiserHandle === 0) {
        throw new Error('Failed to create DTLN denoiser instance');
      }

      // Initialize resamplers using libsamplerate-js
      // We need to resample 8kHz -> 16kHz and back
      const libsamplerate = (await import('@alexanderolsen/libsamplerate-js')) as LibSampleRateModule;
      const converterType = QUALITY_TO_CONVERTER[this.quality];

      this.upsampler = (await libsamplerate.create(
        1,
        this.INPUT_SAMPLE_RATE,
        this.DTLN_SAMPLE_RATE,
        { converterType }
      )) as SRC;

      this.downsampler = (await libsamplerate.create(
        1,
        this.DTLN_SAMPLE_RATE,
        this.INPUT_SAMPLE_RATE,
        { converterType }
      )) as SRC;

      this._initialized = true;
      console.log(`[DTLNProvider] Initialized with quality=${this.quality}`);
    } catch (error) {
      console.error('[DTLNProvider] Initialization failed:', error);
      throw error;
    }
  }

  async process(pcmData: Buffer, options?: Partial<DenoiserOptions>): Promise<Buffer> {
    if (!this._initialized || !this.dtlnModule || !this.upsampler || !this.downsampler) {
      throw new Error('DTLNProvider not initialized');
    }

    const inputSampleRate = options?.sampleRate ?? this.INPUT_SAMPLE_RATE;

    // Fast path: if input is already 16kHz, skip resampling
    if (inputSampleRate === this.DTLN_SAMPLE_RATE) {
      return this.processAt16kHz(pcmData);
    }

    // Standard path: resample 8kHz -> 16kHz -> denoise -> 8kHz
    try {
      // 1. Convert Int16 PCM to Float32 [-1, 1]
      const inputFloat = this.int16ToFloat32(pcmData);

      // 2. Upsample 8kHz -> 16kHz
      const upsampled = this.upsampler.simple(inputFloat, this.UPSAMPLE_RATIO, 1);

      // 3. Process through DTLN (512 samples per frame recommended)
      const numFrames = Math.floor(upsampled.length / this.DTLN_FRAME_SIZE);
      const outputBuffer = new Float32Array(upsampled.length);

      for (let i = 0; i < numFrames; i++) {
        const frameStart = i * this.DTLN_FRAME_SIZE;
        const inputFrame = upsampled.subarray(frameStart, frameStart + this.DTLN_FRAME_SIZE);
        const outputFrame = outputBuffer.subarray(frameStart, frameStart + this.DTLN_FRAME_SIZE);

        // DTLN processes frame and writes to output
        this.dtlnModule.dtln_denoise(this.denoiserHandle, inputFrame, outputFrame);
      }

      // Handle remaining samples (less than one frame)
      const processedSamples = numFrames * this.DTLN_FRAME_SIZE;
      if (processedSamples < upsampled.length) {
        // Copy remaining unprocessed samples as-is
        for (let i = processedSamples; i < upsampled.length; i++) {
          outputBuffer[i] = upsampled[i];
        }
      }

      // 4. Downsample 16kHz -> 8kHz
      const downsampled = this.downsampler.simple(outputBuffer, 1 / this.UPSAMPLE_RATIO, 1);

      // 5. Convert Float32 back to Int16 PCM
      return this.float32ToInt16(downsampled);
    } catch (error) {
      console.error('[DTLNProvider] Processing error:', error);
      // Graceful degradation: return original audio
      return pcmData;
    }
  }

  /**
   * Process audio that's already at 16kHz (no resampling needed)
   */
  private processAt16kHz(pcmData: Buffer): Buffer {
    if (!this.dtlnModule || !this.denoiserHandle) {
      return pcmData;
    }

    // Convert to Float32
    const inputFloat = this.int16ToFloat32(pcmData);
    const outputBuffer = new Float32Array(inputFloat.length);

    // Process frames
    const numFrames = Math.floor(inputFloat.length / this.DTLN_FRAME_SIZE);

    for (let i = 0; i < numFrames; i++) {
      const frameStart = i * this.DTLN_FRAME_SIZE;
      const inputFrame = inputFloat.subarray(frameStart, frameStart + this.DTLN_FRAME_SIZE);
      const outputFrame = outputBuffer.subarray(frameStart, frameStart + this.DTLN_FRAME_SIZE);
      this.dtlnModule.dtln_denoise(this.denoiserHandle, inputFrame, outputFrame);
    }

    // Copy remaining samples
    const processedSamples = numFrames * this.DTLN_FRAME_SIZE;
    for (let i = processedSamples; i < inputFloat.length; i++) {
      outputBuffer[i] = inputFloat[i];
    }

    // Convert back to Int16
    return this.float32ToInt16(outputBuffer);
  }

  /**
   * Synchronous processing
   */
  processSync(pcmData: Buffer): Buffer {
    if (!this._initialized || !this.dtlnModule || !this.upsampler || !this.downsampler) {
      return pcmData; // Passthrough if not initialized
    }

    try {
      const inputFloat = this.int16ToFloat32(pcmData);
      const upsampled = this.upsampler.simple(inputFloat, this.UPSAMPLE_RATIO, 1);

      const numFrames = Math.floor(upsampled.length / this.DTLN_FRAME_SIZE);
      const outputBuffer = new Float32Array(upsampled.length);

      for (let i = 0; i < numFrames; i++) {
        const frameStart = i * this.DTLN_FRAME_SIZE;
        const inputFrame = upsampled.subarray(frameStart, frameStart + this.DTLN_FRAME_SIZE);
        const outputFrame = outputBuffer.subarray(frameStart, frameStart + this.DTLN_FRAME_SIZE);
        this.dtlnModule.dtln_denoise(this.denoiserHandle, inputFrame, outputFrame);
      }

      // Copy remaining samples
      const processedSamples = numFrames * this.DTLN_FRAME_SIZE;
      for (let i = processedSamples; i < upsampled.length; i++) {
        outputBuffer[i] = upsampled[i];
      }

      const downsampled = this.downsampler.simple(outputBuffer, 1 / this.UPSAMPLE_RATIO, 1);
      return this.float32ToInt16(downsampled);
    } catch {
      return pcmData; // Graceful degradation
    }
  }

  /**
   * Convert Int16 PCM buffer to Float32 array
   */
  private int16ToFloat32(pcmData: Buffer): Float32Array {
    const numSamples = pcmData.length / 2;
    const floatData = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      floatData[i] = pcmData.readInt16LE(i * 2) / 32768;
    }

    return floatData;
  }

  /**
   * Convert Float32 array to Int16 PCM buffer
   */
  private float32ToInt16(input: Float32Array): Buffer {
    const output = Buffer.alloc(input.length * 2);

    for (let i = 0; i < input.length; i++) {
      // Clamp to [-1, 1] to prevent overflow
      const sample = Math.max(-1, Math.min(1, input[i]));
      output.writeInt16LE(Math.round(sample * 32767), i * 2);
    }

    return output;
  }

  async destroy(): Promise<void> {
    if (this.dtlnModule && this.denoiserHandle) {
      this.dtlnModule.dtln_stop(this.denoiserHandle);
      this.denoiserHandle = 0;
    }

    if (this.upsampler) {
      this.upsampler.destroy();
      this.upsampler = null;
    }

    if (this.downsampler) {
      this.downsampler.destroy();
      this.downsampler = null;
    }

    this.dtlnModule = null;
    this._initialized = false;

    console.log('[DTLNProvider] Destroyed');
  }

  /**
   * Get provider statistics
   */
  getStats(): {
    initialized: boolean;
    quality: ResamplerQuality;
  } {
    return {
      initialized: this._initialized,
      quality: this.quality
    };
  }
}
