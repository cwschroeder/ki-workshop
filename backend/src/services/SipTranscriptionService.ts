import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { OpenAIService } from './OpenAIService';
import { CsvService } from './CsvService';

const logger = createLogger({ service: 'SipTranscriptionService' });

interface PendingTranscription {
  timeout: NodeJS.Timeout;
}

/**
 * Watches Linphone recording directory and transcribes completed call recordings.
 * Linphone (or linphone-daemon) is responsible for joining SIP calls and writing
 * them to disk (e.g. /tmp/call_<call-id>.wav). Once the file stops changing we
 * treat it as complete, transcribe it with Whisper and persist the transcript.
 */
export class SipTranscriptionService {
  private readonly recordingsDir: string;
  private readonly allowedExtensions = new Set(['.wav', '.mp3']);
  private readonly fileStabilityDelayMs = 3000;
  private readonly openAIService: OpenAIService;
  private readonly csvService: CsvService;
  private watcher: fs.FSWatcher | null = null;
  private pending: Map<string, PendingTranscription> = new Map();

  constructor() {
    this.recordingsDir = path.resolve(env.LINPHONE_RECORDINGS_DIR);
    this.openAIService = new OpenAIService();
    this.csvService = new CsvService();
  }

  async initialize(): Promise<void> {
    try {
      await fs.promises.mkdir(this.recordingsDir, { recursive: true });
      logger.info({ recordingsDir: this.recordingsDir }, 'Watching Linphone recordings directory');

      await this.enqueueExistingFiles();
      this.startWatcher();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize transcription watcher');
      throw error;
    }
  }

  private async enqueueExistingFiles(): Promise<void> {
    const files = await fs.promises.readdir(this.recordingsDir);
    for (const file of files) {
      this.scheduleTranscription(file);
    }
  }

  private startWatcher(): void {
    this.watcher = fs.watch(this.recordingsDir, (eventType, filename) => {
      if (!filename) {
        return;
      }

      // Both rename & change can signal finished recordings depending on OS
      if (eventType === 'rename' || eventType === 'change') {
        this.scheduleTranscription(filename);
      }
    });

    this.watcher.on('error', (error) => {
      logger.error({ error }, 'Watcher error');
    });
  }

  private scheduleTranscription(filename: string): void {
    const extension = path.extname(filename).toLowerCase();
    if (!this.allowedExtensions.has(extension)) {
      return;
    }

    const filePath = path.join(this.recordingsDir, filename);
    // If Linphone is still writing, we will receive multiple events – debounce them
    const existing = this.pending.get(filePath);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    const timeout = setTimeout(async () => {
      this.pending.delete(filePath);
      await this.processRecording(filePath, filename).catch((error) => {
        logger.error({ filePath, error }, 'Failed to process recording');
      });
    }, this.fileStabilityDelayMs);

    this.pending.set(filePath, { timeout });
  }

  private async processRecording(filePath: string, filename: string): Promise<void> {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      logger.debug({ filePath }, 'Recording no longer exists, skipping');
      return;
    }

    const callId = this.extractCallId(filename);
    logger.info({ callId, filePath }, 'Processing recorded call');

    const audioBuffer = await fs.promises.readFile(filePath);
    if (audioBuffer.length === 0) {
      logger.warn({ callId, filePath }, 'Recording file is empty');
      return;
    }

    const transcription = await this.openAIService.transcribeAudio(audioBuffer, callId);
    if (!transcription || transcription.trim().length === 0) {
      logger.info({ callId }, 'No transcription text returned');
      return;
    }

    await this.csvService.saveTranscription({
      call_id: callId,
      timestamp: new Date().toISOString(),
      speaker: 'call',
      text: transcription.trim(),
      confidence: 1
    });

    logger.info({ callId, charCount: transcription.length }, 'Transcription saved');
  }

  private extractCallId(filename: string): string {
    const baseName = path.basename(filename, path.extname(filename));
    const match = baseName.match(/call[_-]?(.+)/i);
    if (match?.[1]) {
      return match[1];
    }
    return baseName;
  }

  async shutdown(): Promise<void> {
    this.pending.forEach(({ timeout }) => clearTimeout(timeout));
    this.pending.clear();

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    logger.info('Stopped Linphone recording watcher');
  }
}
