import { EventEmitter } from 'events';
import { TranscriptStatus, TranscriptUpdate } from '../models/TranscriptUpdate';

interface TranscriptChunkInput {
  sessionId: string;
  speaker: string;
  text: string;
  timestamp?: Date;
  source?: string;
  isFinal?: boolean;
}

interface UtteranceState {
  utteranceId: string;
  text: string;
  startedAt: Date;
  lastUpdate: Date;
  revision: number;
  sessionId: string;
  speaker: string;
  source?: string;
  finalizeTimer?: NodeJS.Timeout;
}

/**
 * Merges incremental STT chunks into stable utterance updates.
 * Emits TranscriptUpdate events that can be pushed to a Web UI.
 */
export class TranscriptUpdateService extends EventEmitter {
  private readonly mergeWindowMs: number;
  private readonly stateByKey: Map<string, UtteranceState> = new Map();

  constructor(mergeWindowMs: number = 2000) {
    super();
    this.mergeWindowMs = mergeWindowMs;
  }

  /**
   * Ingest a new STT chunk and emit an interim/final update with revision + utteranceId.
   */
  ingest(chunk: TranscriptChunkInput): TranscriptUpdate {
    const timestamp = chunk.timestamp ?? new Date();
    const key = this.getKey(chunk.sessionId, chunk.speaker);

    let state = this.stateByKey.get(key);

    if (!state || this.isOutsideMergeWindow(state, timestamp)) {
      // Finalize previous utterance if it was still open
      if (state) {
        this.forceFinalize(key);
      }

      state = {
        utteranceId: `${chunk.sessionId}-${chunk.speaker}-${timestamp.getTime()}`,
        text: '',
        startedAt: timestamp,
        lastUpdate: timestamp,
        revision: 0,
        sessionId: chunk.sessionId,
        speaker: chunk.speaker,
        source: chunk.source
      };

      this.stateByKey.set(key, state);
    }

    state.text = this.mergeText(state.text, chunk.text);
    state.lastUpdate = timestamp;
    state.source = chunk.source || state.source;
    state.revision += 1;

    const update = this.emitUpdate(state, chunk.isFinal ? 'final' : 'interim', timestamp);

    if (chunk.isFinal) {
      this.stateByKey.delete(key);
    } else {
      this.startFinalizeTimer(key);
    }

    return update;
  }

  /**
   * Force final updates for all speakers within a session.
   */
  flushSession(sessionId: string): void {
    for (const key of this.stateByKey.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.forceFinalize(key);
      }
    }
  }

  /**
   * Force final updates for all open utterances.
   */
  flushAll(): void {
    for (const key of this.stateByKey.keys()) {
      this.forceFinalize(key);
    }
  }

  private emitUpdate(
    state: UtteranceState,
    status: TranscriptStatus,
    timestamp: Date
  ): TranscriptUpdate {
    const update: TranscriptUpdate = {
      type: 'transcript_update',
      sessionId: state.sessionId,
      speaker: state.speaker,
      text: state.text.trim(),
      utteranceId: state.utteranceId,
      revision: state.revision,
      startedAt: state.startedAt.toISOString(),
      receivedAt: timestamp.toISOString(),
      status,
      source: state.source
    };

    this.emit('update', update);
    return update;
  }

  private getKey(sessionId: string, speaker: string): string {
    return `${sessionId}:${speaker}`;
  }

  private isOutsideMergeWindow(state: UtteranceState, timestamp: Date): boolean {
    return (timestamp.getTime() - state.lastUpdate.getTime()) > this.mergeWindowMs;
  }

  private startFinalizeTimer(key: string): void {
    const state = this.stateByKey.get(key);
    if (!state) return;

    if (state.finalizeTimer) {
      clearTimeout(state.finalizeTimer);
    }

    state.finalizeTimer = setTimeout(() => {
      this.forceFinalize(key);
    }, this.mergeWindowMs);
  }

  private forceFinalize(key: string): void {
    const state = this.stateByKey.get(key);
    if (!state) return;

    state.revision += 1;
    this.emitUpdate(state, 'final', new Date());
    this.stateByKey.delete(key);
  }

  /**
   * Heuristic to combine incremental texts:
   * - If new text extends the previous (common in streaming), keep the new text
   * - If previous extends the new text, keep the previous (likely duplicate)
   * - Otherwise, append with a space to keep both fragments
   */
  private mergeText(existing: string, incoming: string): string {
    const current = existing.trim();
    const next = incoming.trim();

    if (!current) return next;
    if (!next) return current;

    if (next.startsWith(current)) return next;
    if (current.startsWith(next)) return current;

    return `${current} ${next}`.replace(/\s+/g, ' ').trim();
  }
}
