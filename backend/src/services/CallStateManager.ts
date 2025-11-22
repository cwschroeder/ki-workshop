import { CallState, CallStep } from '../models/CallState';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'CallStateManager' });

export class CallStateManager {
  private states: Map<string, CallState> = new Map();

  createCall(callId: string): CallState {
    const state: CallState = {
      callId,
      step: CallStep.GREETING,
      retryCount: 0,
      transcript: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.states.set(callId, state);
    logger.info({ callId }, 'Call state created');
    return state;
  }

  getCall(callId: string): CallState | undefined {
    return this.states.get(callId);
  }

  updateCall(callId: string, updates: Partial<CallState>): CallState | undefined {
    const state = this.states.get(callId);
    if (!state) {
      logger.warn({ callId }, 'Attempted to update non-existent call state');
      return undefined;
    }

    const updated = {
      ...state,
      ...updates,
      updatedAt: new Date()
    };

    this.states.set(callId, updated);
    logger.debug({ callId, step: updated.step }, 'Call state updated');
    return updated;
  }

  addTranscript(
    callId: string,
    speaker: 'system' | 'user',
    text: string
  ): void {
    const state = this.states.get(callId);
    if (!state) {
      logger.warn({ callId }, 'Attempted to add transcript to non-existent call');
      return;
    }

    state.transcript.push({
      timestamp: new Date().toISOString(),
      speaker,
      text
    });

    state.updatedAt = new Date();
    this.states.set(callId, state);
  }

  advanceStep(callId: string, nextStep: CallStep): void {
    this.updateCall(callId, { step: nextStep, retryCount: 0 });
  }

  incrementRetry(callId: string): number {
    const state = this.states.get(callId);
    if (!state) {
      return 0;
    }

    const newRetryCount = state.retryCount + 1;
    this.updateCall(callId, { retryCount: newRetryCount });
    return newRetryCount;
  }

  deleteCall(callId: string): void {
    this.states.delete(callId);
    logger.info({ callId }, 'Call state deleted');
  }

  getAllActiveCalls(): CallState[] {
    return Array.from(this.states.values()).filter(
      (state) => state.step !== CallStep.COMPLETED && state.step !== CallStep.ERROR
    );
  }
}
