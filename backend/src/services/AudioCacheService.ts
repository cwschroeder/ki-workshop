import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'AudioCacheService' });

export class AudioCacheService {
  private cache: Map<string, Buffer> = new Map();
  private readonly MAX_CACHE_SIZE = 100;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  async store(callId: string, audio: Buffer): Promise<string> {
    const audioId = `${callId}-${Date.now()}`;

    // Simple cache management
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey as string);
    }

    this.cache.set(audioId, audio);

    // Auto-delete after TTL
    setTimeout(() => {
      this.cache.delete(audioId);
      logger.debug({ audioId }, 'Audio cache entry expired');
    }, this.TTL_MS);

    logger.debug({ audioId, size: audio.length }, 'Audio cached');
    return audioId;
  }

  get(audioId: string): Buffer | undefined {
    return this.cache.get(audioId);
  }
}
