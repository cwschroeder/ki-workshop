/**
 * Denoiser Provider Interface
 *
 * Abstraction for noise suppression algorithms (RNNoise, WebRTC NS, etc.)
 * Used to filter background noise from telephony audio before STT processing.
 */

export interface DenoiserOptions {
  /**
   * Sample rate of input audio (e.g., 8000, 16000, 48000)
   */
  sampleRate: number;

  /**
   * Number of audio channels (typically 1 for telephony)
   */
  channels?: number;
}

export interface IDenoiserProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Sample rate required by this denoiser internally
   * (e.g., RNNoise requires 48000 Hz)
   */
  readonly requiredSampleRate: number;

  /**
   * Whether the provider has been initialized
   */
  readonly initialized: boolean;

  /**
   * Initialize the denoiser (load WASM module, allocate buffers, etc.)
   * Must be called before process()
   */
  initialize(): Promise<void>;

  /**
   * Process audio through noise suppression
   * @param pcmData - Raw 16-bit signed PCM data (little-endian)
   * @param options - Processing options (sample rate, channels)
   * @returns Denoised PCM buffer (same format as input)
   */
  process(pcmData: Buffer, options?: Partial<DenoiserOptions>): Promise<Buffer>;

  /**
   * Synchronous processing for low-latency paths (optional)
   * Only available after initialize() completes
   * @param pcmData - Raw 16-bit signed PCM data
   * @returns Denoised PCM buffer
   */
  processSync?(pcmData: Buffer): Buffer;

  /**
   * Clean up resources (WASM memory, buffers, etc.)
   * Should be called when the denoiser is no longer needed
   */
  destroy(): Promise<void>;
}
