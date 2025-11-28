/**
 * Buffer Pool for Noise Suppression
 *
 * Pre-allocated buffer pool for zero-allocation audio processing.
 * Eliminates GC pressure during long calls by reusing typed arrays.
 *
 * Memory usage: ~10KB per instance (constant, regardless of call duration)
 */

export interface BufferPoolConfig {
  /**
   * Input sample rate (default: 8000 Hz - telephony standard)
   */
  inputSampleRate?: number;

  /**
   * RNNoise required sample rate (default: 48000 Hz)
   */
  rnnoiseSampleRate?: number;

  /**
   * Frame duration in milliseconds (default: 20ms - RTP packet size)
   */
  frameDurationMs?: number;
}

export class BufferPool {
  // Configuration
  private readonly inputSampleRate: number;
  private readonly rnnoiseSampleRate: number;
  private readonly frameDurationMs: number;

  // Computed sizes
  private readonly inputFrameSamples: number; // 160 samples @ 8kHz/20ms
  private readonly rnnoiseFrameSize: number; // 480 samples (10ms @ 48kHz)
  private readonly upsampledFrameSamples: number; // 960 samples @ 48kHz/20ms

  // Pre-allocated buffers for RNNoise processing
  readonly rnnoiseFrame1: Float32Array; // First 10ms frame (480 samples)
  readonly rnnoiseFrame2: Float32Array; // Second 10ms frame (480 samples)

  // Pre-allocated buffers for resampling
  readonly upsampleBuffer: Float32Array; // 20ms @ 48kHz (960 samples)
  readonly downsampleBuffer: Float32Array; // 20ms @ 8kHz (160 samples)

  // Pre-allocated buffers for format conversion
  readonly inputFloat32: Float32Array; // Input converted to float
  readonly outputInt16: Int16Array; // Output converted to int16

  constructor(config: BufferPoolConfig = {}) {
    this.inputSampleRate = config.inputSampleRate ?? 8000;
    this.rnnoiseSampleRate = config.rnnoiseSampleRate ?? 48000;
    this.frameDurationMs = config.frameDurationMs ?? 20;

    // Calculate buffer sizes
    this.inputFrameSamples = (this.inputSampleRate * this.frameDurationMs) / 1000; // 160
    this.rnnoiseFrameSize = 480; // RNNoise fixed frame size (10ms @ 48kHz)
    this.upsampledFrameSamples = (this.rnnoiseSampleRate * this.frameDurationMs) / 1000; // 960

    // Allocate buffers
    this.rnnoiseFrame1 = new Float32Array(this.rnnoiseFrameSize);
    this.rnnoiseFrame2 = new Float32Array(this.rnnoiseFrameSize);
    this.upsampleBuffer = new Float32Array(this.upsampledFrameSamples);
    this.downsampleBuffer = new Float32Array(this.inputFrameSamples);
    this.inputFloat32 = new Float32Array(this.inputFrameSamples);
    this.outputInt16 = new Int16Array(this.inputFrameSamples);
  }

  /**
   * Get the expected input frame size in bytes (16-bit samples)
   */
  getInputFrameBytes(): number {
    return this.inputFrameSamples * 2;
  }

  /**
   * Get the expected input frame size in samples
   */
  getInputFrameSamples(): number {
    return this.inputFrameSamples;
  }

  /**
   * Get the upsampled frame size in samples (48kHz)
   */
  getUpsampledFrameSamples(): number {
    return this.upsampledFrameSamples;
  }

  /**
   * Convert Int16 PCM buffer to Float32 array (normalized to [-1, 1])
   * Uses pre-allocated inputFloat32 buffer
   */
  int16ToFloat32(input: Buffer): Float32Array {
    const samples = Math.min(input.length / 2, this.inputFloat32.length);
    for (let i = 0; i < samples; i++) {
      this.inputFloat32[i] = input.readInt16LE(i * 2) / 32768;
    }
    return this.inputFloat32;
  }

  /**
   * Convert Float32 array to Int16 PCM buffer
   * @param input - Float32 array with values in [-1, 1]
   * @returns Buffer with 16-bit signed PCM (little-endian)
   */
  float32ToInt16Buffer(input: Float32Array): Buffer {
    const samples = Math.min(input.length, this.outputInt16.length);
    const output = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
      // Clamp to [-1, 1] to prevent overflow
      const sample = Math.max(-1, Math.min(1, input[i]));
      output.writeInt16LE(Math.round(sample * 32767), i * 2);
    }

    return output;
  }

  /**
   * Split upsampled buffer into two RNNoise frames
   * RNNoise processes 480 samples (10ms) at a time
   */
  splitIntoRnnoiseFrames(): void {
    this.rnnoiseFrame1.set(this.upsampleBuffer.subarray(0, this.rnnoiseFrameSize));
    this.rnnoiseFrame2.set(
      this.upsampleBuffer.subarray(this.rnnoiseFrameSize, this.rnnoiseFrameSize * 2)
    );
  }

  /**
   * Combine two RNNoise frames back into upsampled buffer
   */
  combineRnnoiseFrames(): void {
    this.upsampleBuffer.set(this.rnnoiseFrame1, 0);
    this.upsampleBuffer.set(this.rnnoiseFrame2, this.rnnoiseFrameSize);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): { totalBytes: number; breakdown: Record<string, number> } {
    const breakdown = {
      rnnoiseFrame1: this.rnnoiseFrame1.byteLength,
      rnnoiseFrame2: this.rnnoiseFrame2.byteLength,
      upsampleBuffer: this.upsampleBuffer.byteLength,
      downsampleBuffer: this.downsampleBuffer.byteLength,
      inputFloat32: this.inputFloat32.byteLength,
      outputInt16: this.outputInt16.byteLength
    };

    const totalBytes = Object.values(breakdown).reduce((sum, bytes) => sum + bytes, 0);

    return { totalBytes, breakdown };
  }
}
