/**
 * RNNoise WASM Provider
 *
 * Uses @jitsi/rnnoise-wasm for Node.js compatible noise suppression.
 * RNNoise is a neural network trained specifically on speech and works well
 * with telephony audio quality.
 *
 * Note: RNNoise requires 48kHz input, so we resample from 8kHz and back.
 *
 * @see https://github.com/xiph/rnnoise
 * @see https://github.com/jitsi/rnnoise-wasm
 */

import type { IDenoiserProvider, DenoiserOptions } from '../IDenoiserProvider';
import { BufferPool } from '../../../sip/BufferPool';
import * as path from 'path';
import { createRequire } from 'module';

// Type for libsamplerate-js - actual API uses options object
interface SRC {
  simple(input: Float32Array, ratio: number, nChannels: number): Float32Array;
  destroy(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LibSampleRateModule = any; // Use any to avoid type conflicts with actual library

// Converter type enum values from libsamplerate
type ConverterType = 0 | 1 | 2 | 3 | 4;

export type ResamplerQuality = 'low' | 'medium' | 'high';

const QUALITY_TO_CONVERTER: Record<ResamplerQuality, ConverterType> = {
  low: 4, // SRC_LINEAR
  medium: 2, // SRC_SINC_FASTEST
  high: 1 // SRC_SINC_MEDIUM_QUALITY
};

export interface RNNoiseProviderOptions {
  /**
   * Resampling quality (affects CPU usage and audio quality)
   * - 'low': Fastest, lowest quality
   * - 'medium': Good balance (default)
   * - 'high': Best quality, slower
   */
  quality?: ResamplerQuality;
}

// RNNoise WASM module interface (Emscripten low-level API)
interface RNNoiseWASMModule {
  _rnnoise_create(): number; // Returns pointer to DenoiseState
  _rnnoise_destroy(state: number): void;
  _rnnoise_process_frame(state: number, output: number, input: number): number; // Returns VAD probability
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  ready: Promise<RNNoiseWASMModule>;
}

export class RNNoiseProvider implements IDenoiserProvider {
  readonly name = 'rnnoise';
  readonly requiredSampleRate = 48000; // RNNoise requires 48kHz

  private _initialized = false;
  private wasmModule: RNNoiseWASMModule | null = null;
  private denoiseStatePtr: number = 0;
  private inputBufferPtr: number = 0;
  private outputBufferPtr: number = 0;
  private upsampler: SRC | null = null;
  private downsampler: SRC | null = null;
  private bufferPool: BufferPool;
  private quality: ResamplerQuality;

  // Constants
  private readonly INPUT_SAMPLE_RATE = 8000;
  private readonly RNNOISE_SAMPLE_RATE = 48000;
  private readonly RNNOISE_FRAME_SIZE = 480; // 10ms @ 48kHz (RNNoise fixed frame size)
  private readonly UPSAMPLE_RATIO = this.RNNOISE_SAMPLE_RATE / this.INPUT_SAMPLE_RATE; // 6

  constructor(options: RNNoiseProviderOptions = {}) {
    this.quality = options.quality ?? 'medium';
    this.bufferPool = new BufferPool({
      inputSampleRate: this.INPUT_SAMPLE_RATE,
      rnnoiseSampleRate: this.RNNOISE_SAMPLE_RATE,
      frameDurationMs: 20
    });
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      // Load @jitsi/rnnoise-wasm using require.resolve for proper node_modules resolution
      // The sync version has WASM inlined as base64, so no file loading needed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const localRequire = typeof require !== 'undefined' ? require : createRequire(__filename);

      // First, resolve the package entry point to get the correct node_modules path
      let rnnoiseModulePath: string;
      try {
        // Try to resolve the package, then adjust path to get the sync version
        const packagePath = localRequire.resolve('@jitsi/rnnoise-wasm');
        // packagePath will be something like .../node_modules/@jitsi/rnnoise-wasm/index.js
        // We need .../node_modules/@jitsi/rnnoise-wasm/dist/rnnoise-sync.js
        const packageDir = path.dirname(packagePath);
        rnnoiseModulePath = path.join(packageDir, 'dist', 'rnnoise-sync.js');
      } catch {
        // Fallback: try direct path resolution from current file
        rnnoiseModulePath = path.resolve(
          __dirname,
          '../../../../../node_modules/@jitsi/rnnoise-wasm/dist/rnnoise-sync.js'
        );
      }

      // Load the module - the sync version works with both require and import
      console.log(`[RNNoiseProvider] Loading WASM module from: ${rnnoiseModulePath}`);

      // Try dynamic import first (works better with ESM modules)
      // The file:// URL is needed for dynamic import in Node.js
      let createRNNWasmModuleSync: () => Promise<RNNoiseWASMModule>;
      try {
        const rnnoiseModule = await import(`file://${rnnoiseModulePath}`);
        createRNNWasmModuleSync = rnnoiseModule.default;
      } catch {
        // Fallback: try require directly (for older Node.js or CommonJS context)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const rnnoiseModule = localRequire(rnnoiseModulePath);
        createRNNWasmModuleSync = rnnoiseModule.default || rnnoiseModule;
      }

      // Initialize the WASM module
      this.wasmModule = await createRNNWasmModuleSync();

      if (!this.wasmModule) {
        throw new Error('Failed to create RNNoise WASM module');
      }

      // Create denoise state
      this.denoiseStatePtr = this.wasmModule._rnnoise_create();
      if (this.denoiseStatePtr === 0) {
        throw new Error('Failed to create RNNoise denoise state');
      }

      // Allocate WASM heap buffers for audio processing (480 floats = 1920 bytes each)
      const bufferSize = this.RNNOISE_FRAME_SIZE * 4; // 4 bytes per float32
      this.inputBufferPtr = this.wasmModule._malloc(bufferSize);
      this.outputBufferPtr = this.wasmModule._malloc(bufferSize);

      if (this.inputBufferPtr === 0 || this.outputBufferPtr === 0) {
        throw new Error('Failed to allocate WASM heap buffers');
      }

      // Initialize resamplers using libsamplerate-js
      const libsamplerate = (await import('@alexanderolsen/libsamplerate-js')) as LibSampleRateModule;
      const converterType = QUALITY_TO_CONVERTER[this.quality];

      this.upsampler = (await libsamplerate.create(
        1,
        this.INPUT_SAMPLE_RATE,
        this.RNNOISE_SAMPLE_RATE,
        { converterType }
      )) as SRC;

      this.downsampler = (await libsamplerate.create(
        1,
        this.RNNOISE_SAMPLE_RATE,
        this.INPUT_SAMPLE_RATE,
        { converterType }
      )) as SRC;

      this._initialized = true;
      console.log(`[RNNoiseProvider] Initialized with quality=${this.quality}`);

      // Log memory usage
      const stats = this.bufferPool.getMemoryStats();
      console.log(`[RNNoiseProvider] Buffer pool allocated: ${stats.totalBytes} bytes`);
    } catch (error) {
      console.error('[RNNoiseProvider] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Process a single RNNoise frame (480 samples @ 48kHz)
   * Audio is copied to WASM heap, processed, and copied back
   */
  private processRNNoiseFrame(frame: Float32Array): void {
    if (!this.wasmModule || !this.denoiseStatePtr) {
      return;
    }

    // Copy input to WASM heap
    const inputHeapOffset = this.inputBufferPtr / 4; // Convert byte offset to float offset
    this.wasmModule.HEAPF32.set(frame, inputHeapOffset);

    // Process frame (RNNoise expects input values in range ~[-32768, 32767])
    // Scale up before processing, scale down after
    for (let i = 0; i < this.RNNOISE_FRAME_SIZE; i++) {
      this.wasmModule.HEAPF32[inputHeapOffset + i] *= 32768;
    }

    // Call RNNoise - returns VAD probability (0-1), we ignore it
    this.wasmModule._rnnoise_process_frame(
      this.denoiseStatePtr,
      this.outputBufferPtr,
      this.inputBufferPtr
    );

    // Copy output from WASM heap and scale back down
    const outputHeapOffset = this.outputBufferPtr / 4;
    for (let i = 0; i < this.RNNOISE_FRAME_SIZE; i++) {
      frame[i] = this.wasmModule.HEAPF32[outputHeapOffset + i] / 32768;
    }
  }

  async process(pcmData: Buffer, options?: Partial<DenoiserOptions>): Promise<Buffer> {
    if (!this._initialized || !this.wasmModule || !this.upsampler || !this.downsampler) {
      throw new Error('RNNoiseProvider not initialized');
    }

    const inputSampleRate = options?.sampleRate ?? this.INPUT_SAMPLE_RATE;

    // Fast path: if input is already 48kHz, skip resampling
    if (inputSampleRate === this.RNNOISE_SAMPLE_RATE) {
      return this.processAt48kHz(pcmData);
    }

    // Standard path: resample 8kHz -> 48kHz -> denoise -> 8kHz
    try {
      // 1. Convert Int16 PCM to Float32
      const inputFloat = this.bufferPool.int16ToFloat32(pcmData);

      // 2. Upsample 8kHz -> 48kHz
      const upsampled = this.upsampler.simple(inputFloat, this.UPSAMPLE_RATIO, 1);

      // 3. Process through RNNoise (480 samples = 10ms per frame)
      const numFrames = Math.floor(upsampled.length / this.RNNOISE_FRAME_SIZE);

      for (let i = 0; i < numFrames; i++) {
        const frameStart = i * this.RNNOISE_FRAME_SIZE;
        const frame = upsampled.subarray(frameStart, frameStart + this.RNNOISE_FRAME_SIZE);
        this.processRNNoiseFrame(frame);
      }

      // 4. Downsample 48kHz -> 8kHz
      const downsampled = this.downsampler.simple(upsampled, 1 / this.UPSAMPLE_RATIO, 1);

      // 5. Convert Float32 back to Int16 PCM
      return this.float32ToInt16(downsampled);
    } catch (error) {
      console.error('[RNNoiseProvider] Processing error:', error);
      // Graceful degradation: return original audio
      return pcmData;
    }
  }

  /**
   * Process audio that's already at 48kHz (no resampling needed)
   */
  private processAt48kHz(pcmData: Buffer): Buffer {
    if (!this.wasmModule || !this.denoiseStatePtr) {
      return pcmData;
    }

    // Convert to Float32
    const numSamples = pcmData.length / 2;
    const floatData = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      floatData[i] = pcmData.readInt16LE(i * 2) / 32768;
    }

    // Process frames
    const numFrames = Math.floor(numSamples / this.RNNOISE_FRAME_SIZE);

    for (let i = 0; i < numFrames; i++) {
      const frameStart = i * this.RNNOISE_FRAME_SIZE;
      const frame = floatData.subarray(frameStart, frameStart + this.RNNOISE_FRAME_SIZE);
      this.processRNNoiseFrame(frame);
    }

    // Convert back to Int16
    return this.float32ToInt16(floatData);
  }

  /**
   * Synchronous processing (uses pre-allocated buffers)
   */
  processSync(pcmData: Buffer): Buffer {
    if (!this._initialized || !this.wasmModule || !this.upsampler || !this.downsampler) {
      return pcmData; // Passthrough if not initialized
    }

    try {
      const inputFloat = this.bufferPool.int16ToFloat32(pcmData);
      const upsampled = this.upsampler.simple(inputFloat, this.UPSAMPLE_RATIO, 1);

      const numFrames = Math.floor(upsampled.length / this.RNNOISE_FRAME_SIZE);
      for (let i = 0; i < numFrames; i++) {
        const frameStart = i * this.RNNOISE_FRAME_SIZE;
        const frame = upsampled.subarray(frameStart, frameStart + this.RNNOISE_FRAME_SIZE);
        this.processRNNoiseFrame(frame);
      }

      const downsampled = this.downsampler.simple(upsampled, 1 / this.UPSAMPLE_RATIO, 1);
      return this.float32ToInt16(downsampled);
    } catch {
      return pcmData; // Graceful degradation
    }
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
    if (this.wasmModule) {
      // Free WASM heap buffers
      if (this.inputBufferPtr) {
        this.wasmModule._free(this.inputBufferPtr);
        this.inputBufferPtr = 0;
      }
      if (this.outputBufferPtr) {
        this.wasmModule._free(this.outputBufferPtr);
        this.outputBufferPtr = 0;
      }

      // Destroy denoise state
      if (this.denoiseStatePtr) {
        this.wasmModule._rnnoise_destroy(this.denoiseStatePtr);
        this.denoiseStatePtr = 0;
      }

      this.wasmModule = null;
    }

    if (this.upsampler) {
      this.upsampler.destroy();
      this.upsampler = null;
    }

    if (this.downsampler) {
      this.downsampler.destroy();
      this.downsampler = null;
    }

    this._initialized = false;
    console.log('[RNNoiseProvider] Destroyed');
  }

  /**
   * Get provider statistics
   */
  getStats(): {
    initialized: boolean;
    quality: ResamplerQuality;
    memoryUsage: ReturnType<BufferPool['getMemoryStats']>;
  } {
    return {
      initialized: this._initialized,
      quality: this.quality,
      memoryUsage: this.bufferPool.getMemoryStats()
    };
  }
}
