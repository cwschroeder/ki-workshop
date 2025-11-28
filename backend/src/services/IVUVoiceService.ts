/**
 * IVU Voice Service
 *
 * Core service that orchestrates call control using AI and Telephony providers.
 * This is the main business logic layer that clients interact with.
 */

import type { IAIProvider, ChatMessage, ChatOptions } from '../providers/ai/IAIProvider';
import type {
  ITelephonyProvider,
  TelephonyBlock,
  MakeCallOptions,
  MakeCallResponse,
  SendSMSOptions,
  SendSMSResponse,
  StartRecordingOptions,
  StartRecordingResponse,
  StopRecordingOptions,
  StopRecordingResponse,
  RetrieveRecordingOptions,
  RetrieveRecordingResponse
} from '../providers/telephony/ITelephonyProvider';
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
   * Bridge call to another destination (call transfer)
   */
  async bridge(
    sessionId: string,
    destination: string,
    options?: TransferOptions
  ): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Bridge (${sessionId}): ${destination}`);

    return this.telephonyProvider.bridge(destination, {
      destinationType: options?.destinationType,
      timeout: options?.timeout
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
   * Play pre-recorded announcement
   */
  async playAnnouncement(sessionId: string, announcementName: string): Promise<TelephonyBlock> {
    const session = this.getSessionOrThrow(sessionId);
    this.sessionManager.updateActivity(sessionId);

    console.log(`[IVUVoiceService] Play announcement (${sessionId}): ${announcementName}`);

    return this.telephonyProvider.playAnnouncement(announcementName);
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

    // Note: WebSocket emit is handled by webhook.routes.ts to avoid duplicates
  }

  /**
   * Make an outbound call
   *
   * Initiates an outbound call using TENIOS MakeCall API.
   * The call will be handled by the routing plan configured for the specified TENIOS number.
   *
   * @param options MakeCall parameters
   * @returns Promise with callback ID
   */
  async makeCall(options: MakeCallOptions): Promise<MakeCallResponse> {
    console.log(`[IVUVoiceService] Making outbound call to ${options.destinationNumber}`);

    return await this.telephonyProvider.makeCall(options);
  }

  /**
   * Send SMS message
   *
   * Sends an SMS using TENIOS SMS API.
   * Requires Account-SID and Auth Token to be configured.
   *
   * @param options SMS parameters
   * @returns Promise with message URI and status
   */
  async sendSMS(options: SendSMSOptions): Promise<SendSMSResponse> {
    console.log(`[IVUVoiceService] Sending SMS to ${options.to}`);

    return await this.telephonyProvider.sendSMS(options);
  }

  /**
   * Start call recording
   *
   * Starts recording an ongoing call using the Recording API.
   * The call must be active and have a call UUID.
   *
   * @param options Start recording parameters
   * @returns Promise with recording UUID
   */
  async startRecording(options: StartRecordingOptions): Promise<StartRecordingResponse> {
    console.log(`[IVUVoiceService] Starting recording for call ${options.callUuid}`);

    return await this.telephonyProvider.startRecording(options);
  }

  /**
   * Stop call recording
   *
   * Stops an ongoing recording.
   *
   * @param options Stop recording parameters
   * @returns Promise with success status
   */
  async stopRecording(options: StopRecordingOptions): Promise<StopRecordingResponse> {
    console.log(`[IVUVoiceService] Stopping recording ${options.recordingUuid}`);

    return await this.telephonyProvider.stopRecording(options);
  }

  /**
   * Retrieve call recording
   *
   * Retrieves the audio file for a recording.
   *
   * @param options Retrieve recording parameters
   * @returns Promise with recording data
   */
  async retrieveRecording(options: RetrieveRecordingOptions): Promise<RetrieveRecordingResponse> {
    console.log(`[IVUVoiceService] Retrieving recording ${options.recordingUuid}`);

    return await this.telephonyProvider.retrieveRecording(options);
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
   * Chat with AI (direct LLM access)
   *
   * Allows per-request provider selection via options.provider.
   * If the aiProvider is a CompositeAIProvider, the provider option
   * will be used to select the specific LLM provider.
   *
   * @param messages Chat messages
   * @param options Chat options including optional provider selection
   * @returns AI response text
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    console.log(`[IVUVoiceService] Chat (provider: ${options?.provider || 'default'})`);

    return await this.aiProvider.chat(messages, options);
  }

  /**
   * Get the AI provider (for advanced use cases)
   */
  getAIProvider(): IAIProvider {
    return this.aiProvider;
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
