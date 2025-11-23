/**
 * IVU Voice Service
 *
 * Core service that orchestrates call control using AI and Telephony providers.
 * This is the main business logic layer that clients interact with.
 */

import type { IAIProvider, ChatMessage } from '../providers/ai/IAIProvider';
import type { ITelephonyProvider, TelephonyBlock } from '../providers/telephony/ITelephonyProvider';
import type { SessionManager } from './SessionManager';
import type { VoiceSession } from '../models/VoiceSession';

export interface SayOptions {
  voice?: string;
  useSsml?: boolean;
}

export interface CollectSpeechOptions {
  prompt?: string;
  language?: string;
  timeout?: number;
  maxTries?: number;
}

export interface CollectDigitsOptions {
  maxDigits: number;
  minDigits?: number;
  prompt?: string;
  timeout?: number;
  allowSpeech?: boolean;
  speechLanguage?: string;
}

export interface TransferOptions {
  destinationType?: 'SIP_USER' | 'PHONE_NUMBER';
  timeout?: number;
}

export interface AIConversationOptions {
  systemPrompt: string;
  maxTurns?: number;
  temperature?: number;
}

export interface AIConversationResult {
  messages: ChatMessage[];
  turnCount: number;
}

export class IVUVoiceService {
  constructor(
    private sessionManager: SessionManager,
    private aiProvider: IAIProvider,
    private telephonyProvider: ITelephonyProvider
  ) {}

  /**
   * Say text to caller (Text-to-Speech)
   */
  async say(sessionId: string, text: string, options?: SayOptions): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Say (${sessionId}): ${text.substring(0, 50)}...`);

    // Add to conversation history
    session.conversationHistory.push({
      role: 'assistant',
      content: text
    });

    return this.telephonyProvider.say(text, {
      voice: options?.voice,
      useSsml: options?.useSsml
    });
  }

  /**
   * Collect speech from caller (ASR)
   */
  async collectSpeech(
    sessionId: string,
    options: CollectSpeechOptions
  ): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Collect speech (${sessionId})`);

    return this.telephonyProvider.collectSpeech({
      language: options.language || 'de-DE',
      timeout: options.timeout,
      maxTries: options.maxTries,
      prompt: options.prompt
    });
  }

  /**
   * Collect DTMF digits from caller
   */
  async collectDigits(
    sessionId: string,
    options: CollectDigitsOptions
  ): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Collect digits (${sessionId}): max ${options.maxDigits}`);

    return this.telephonyProvider.collectDigits({
      maxDigits: options.maxDigits,
      minDigits: options.minDigits,
      timeout: options.timeout,
      prompt: options.prompt,
      allowSpeech: options.allowSpeech,
      speechLanguage: options.speechLanguage
    });
  }

  /**
   * Transfer call to another destination
   */
  async transfer(
    sessionId: string,
    destination: string,
    options?: TransferOptions
  ): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Transfer (${sessionId}): ${destination}`);

    return this.telephonyProvider.bridge(destination, {
      destinationType: options?.destinationType,
      timeout: options?.timeout
    });
  }

  /**
   * Hangup call
   */
  async hangup(sessionId: string): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Hangup (${sessionId})`);

    if (session.activeCallId) {
      this.sessionManager.endCall(session.activeCallId);
    }

    return this.telephonyProvider.hangup();
  }

  /**
   * AI-powered conversation
   * Conducts multi-turn dialogue using LLM
   */
  async aiConversation(
    sessionId: string,
    options: AIConversationOptions
  ): Promise<AIConversationResult> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Starting AI conversation (${sessionId})`);

    const messages: ChatMessage[] = [];
    const maxTurns = options.maxTurns || 10;

    for (let turn = 0; turn < maxTurns; turn++) {
      console.log(`[IVUVoiceService] AI turn ${turn + 1}/${maxTurns}`);

      // AI generates response
      const aiResponse = await this.aiProvider.chat(messages, {
        systemPrompt: options.systemPrompt,
        temperature: options.temperature
      });

      messages.push({ role: 'assistant', content: aiResponse });
      session.conversationHistory.push({ role: 'assistant', content: aiResponse });

      // Emit AI response to client via WebSocket
      if (session.socket) {
        session.socket.emit('ai.response', { turn, response: aiResponse });
      }

      // Check if AI wants to end conversation
      if (aiResponse.includes('[END_CALL]')) {
        console.log(`[IVUVoiceService] AI ended conversation at turn ${turn + 1}`);
        break;
      }

      // Note: In real implementation, this would wait for user speech input
      // via TENIOS webhook. For now, this is a placeholder showing the flow.
      // The actual user input collection happens in the webhook handler.
    }

    return {
      messages,
      turnCount: messages.filter((m) => m.role === 'user').length
    };
  }

  /**
   * Process user input (from TENIOS webhook)
   */
  async processUserInput(sessionId: string, userInput: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] User input (${sessionId}): ${userInput}`);

    // Add to conversation history
    session.conversationHistory.push({
      role: 'user',
      content: userInput
    });

    // Emit to client via WebSocket
    if (session.socket) {
      session.socket.emit('call.user_input', { input: userInput });
    }
  }

  /**
   * Extract structured information from text using AI
   */
  async extractCustomerInfo(text: string): Promise<{
    customerNumber?: string;
    meterNumber?: string;
    reading?: number;
  }> {
    console.log(`[IVUVoiceService] Extracting info from: ${text.substring(0, 50)}...`);

    return await this.aiProvider.extractNumbers(text);
  }

  /**
   * Create call control response with multiple blocks
   */
  createResponse(blocks: TelephonyBlock[]) {
    return this.telephonyProvider.createResponse(blocks);
  }

  /**
   * Get session (throws if not found)
   */
  private getSessionOrThrow(sessionId: string): VoiceSession {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }
}
