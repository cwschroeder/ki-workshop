/**
 * Null Denoiser Provider
 *
 * Passthrough provider that returns audio unchanged.
 * Used when denoising is disabled or as a fallback.
 */

import type { IDenoiserProvider, DenoiserOptions } from '../IDenoiserProvider';

export class NullDenoiserProvider implements IDenoiserProvider {
  readonly name = 'none';
  readonly requiredSampleRate = 8000; // Any rate works (passthrough)

  private _initialized = false;

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    this._initialized = true;
    console.log('[NullDenoiserProvider] Initialized (passthrough mode)');
  }

  async process(pcmData: Buffer, _options?: Partial<DenoiserOptions>): Promise<Buffer> {
    return pcmData; // Passthrough - no processing
  }

  processSync(pcmData: Buffer): Buffer {
    return pcmData; // Passthrough - no processing
  }

  async destroy(): Promise<void> {
    this._initialized = false;
    // Nothing to clean up
  }
}
