/**
 * Session Manager
 *
 * Manages active voice sessions and their associated WebSocket connections.
 * Handles session lifecycle, call routing, and state persistence.
 */

import type { Socket } from 'socket.io';
import type { VoiceSession, CallState } from '../models/VoiceSession';
import { randomUUID } from 'crypto';

export class SessionManager {
  private sessions: Map<string, VoiceSession> = new Map();
  private callToSession: Map<string, string> = new Map(); // callId -> sessionId
  private phoneToSession: Map<string, string> = new Map(); // phoneNumber -> sessionId

  /**
   * Create a new voice session
   */
  createSession(socket: Socket, userId?: string): VoiceSession {
    const sessionId = randomUUID();

    const session: VoiceSession = {
      sessionId,
      userId,
      socket,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      conversationHistory: [],
      metadata: {}
    };

    this.sessions.set(sessionId, session);

    console.log(`[SessionManager] Created session ${sessionId}${userId ? ` for user ${userId}` : ''}`);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by call ID
   */
  getSessionByCallId(callId: string): VoiceSession | undefined {
    const sessionId = this.callToSession.get(callId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Get session by phone number
   */
  getSessionByPhone(phoneNumber: string): VoiceSession | undefined {
    const sessionId = this.phoneToSession.get(phoneNumber);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Assign phone number to session
   */
  assignPhoneNumber(sessionId: string, phoneNumber: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Remove old mapping if phone was assigned to different session
    const oldSessionId = this.phoneToSession.get(phoneNumber);
    if (oldSessionId && oldSessionId !== sessionId) {
      const oldSession = this.sessions.get(oldSessionId);
      if (oldSession) {
        oldSession.assignedPhoneNumber = undefined;
      }
    }

    session.assignedPhoneNumber = phoneNumber;
    this.phoneToSession.set(phoneNumber, sessionId);

    console.log(`[SessionManager] Assigned phone ${phoneNumber} to session ${sessionId}`);
  }

  /**
   * Associate call with session
   */
  registerCall(sessionId: string, callId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.activeCallId = callId;
    session.lastActivityAt = new Date();
    this.callToSession.set(callId, sessionId);

    console.log(`[SessionManager] Registered call ${callId} to session ${sessionId}`);
  }

  /**
   * End call and remove association
   */
  endCall(callId: string): void {
    const sessionId = this.callToSession.get(callId);
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session && session.activeCallId === callId) {
        session.activeCallId = undefined;
        session.lastActivityAt = new Date();
      }
      this.callToSession.delete(callId);
      console.log(`[SessionManager] Ended call ${callId}`);
    }
  }

  /**
   * Update session activity timestamp
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Delete session and cleanup
   */
  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Cleanup phone mapping
    if (session.assignedPhoneNumber) {
      this.phoneToSession.delete(session.assignedPhoneNumber);
    }

    // Cleanup call mapping
    if (session.activeCallId) {
      this.callToSession.delete(session.activeCallId);
    }

    // Disconnect socket
    if (session.socket) {
      session.socket.disconnect(true);
    }

    this.sessions.delete(sessionId);

    console.log(`[SessionManager] Deleted session ${sessionId}`);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): VoiceSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup inactive sessions (older than timeout)
   */
  cleanupInactiveSessions(timeoutMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastActivityAt.getTime();

      if (inactiveTime > timeoutMs && !session.activeCallId) {
        this.deleteSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} inactive sessions`);
    }

    return cleaned;
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeCalls: number;
    assignedPhones: number;
  } {
    let activeCalls = 0;

    for (const session of this.sessions.values()) {
      if (session.activeCallId) {
        activeCalls++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeCalls,
      assignedPhones: this.phoneToSession.size
    };
  }
}
