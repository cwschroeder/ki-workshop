/**
 * Voice Session Model
 *
 * Represents an active voice session with WebSocket connection
 */

import type { Socket } from 'socket.io';
import type { ChatMessage } from '../providers/ai/IAIProvider';

export interface VoiceSession {
  sessionId: string;
  userId?: string;
  assignedPhoneNumber?: string;
  activeCallId?: string;
  socket?: Socket;
  createdAt: Date;
  lastActivityAt: Date;
  conversationHistory: ChatMessage[];
  metadata: Record<string, any>;
}

export interface CallState {
  callId: string;
  sessionId: string;
  status: 'active' | 'completed' | 'failed';
  startedAt: Date;
  endedAt?: Date;
  transcript: Array<{
    timestamp: Date;
    speaker: 'user' | 'system';
    text: string;
  }>;
  metadata: Record<string, any>;
}
