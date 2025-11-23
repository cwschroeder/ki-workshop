/**
 * Telephony Provider Interface
 *
 * This interface abstracts telephony operations to allow
 * easy switching between providers (TENIOS, Twilio, Vonage, etc.)
 */

export type BlockType = 'SAY' | 'COLLECT_SPEECH' | 'COLLECT_DIGITS' | 'BRIDGE' | 'HANGUP';

export interface SayBlock {
  blockType: 'SAY';
  text: string;
  voiceName?: string;
  useSsml?: boolean;
}

export interface CollectSpeechBlock {
  blockType: 'COLLECT_SPEECH';
  asrProvider?: string;
  language: string;
  variableName?: string;
  maxTries?: number;
  timeout?: number;
  prompt?: string;
}

export interface CollectDigitsBlock {
  blockType: 'COLLECT_DIGITS';
  maxDigits: number;
  minDigits?: number;
  timeout?: number;
  prompt?: string;
  finishOnKey?: string;
  allowSpeechInput?: boolean;
  speechOptions?: {
    asrProvider?: string;
    language: string;
    variableName?: string;
  };
}

export interface BridgeDestination {
  destination: string;
  destinationType: 'SIP_USER' | 'PHONE_NUMBER';
  timeout?: number;
}

export interface BridgeBlock {
  blockType: 'BRIDGE';
  bridgeMode: 'SEQUENTIAL' | 'PARALLEL';
  destinations: BridgeDestination[];
}

export interface HangupBlock {
  blockType: 'HANGUP';
  reason?: string;
}

export type TelephonyBlock =
  | SayBlock
  | CollectSpeechBlock
  | CollectDigitsBlock
  | BridgeBlock
  | HangupBlock;

export interface CallControlResponse {
  blocks: TelephonyBlock[];
}

export interface IncomingCallData {
  callId: string;
  callUuid?: string;
  from?: string;
  to?: string;
  loopCount?: number;
  userInput?: string;
  variables?: Record<string, any>;
}

/**
 * Telephony Provider Interface
 *
 * Implementations:
 * - TeniosProvider: Uses TENIOS Call Control API
 * - TwilioProvider: Uses Twilio Voice API (future)
 * - VonageProvider: Uses Vonage Voice API (future)
 */
export interface ITelephonyProvider {
  /**
   * Create a response for incoming call webhook
   */
  createResponse(blocks: TelephonyBlock[]): CallControlResponse;

  /**
   * Parse incoming webhook data to normalized format
   */
  parseIncomingCall(body: any): IncomingCallData;

  /**
   * Create a SAY block
   */
  say(text: string, options?: { voice?: string; useSsml?: boolean }): SayBlock;

  /**
   * Create a COLLECT_SPEECH block
   */
  collectSpeech(options: {
    language: string;
    timeout?: number;
    maxTries?: number;
    prompt?: string;
  }): CollectSpeechBlock;

  /**
   * Create a COLLECT_DIGITS block
   */
  collectDigits(options: {
    maxDigits: number;
    minDigits?: number;
    timeout?: number;
    prompt?: string;
    allowSpeech?: boolean;
    speechLanguage?: string;
  }): CollectDigitsBlock;

  /**
   * Create a BRIDGE block (call transfer)
   */
  bridge(destination: string, options?: {
    destinationType?: 'SIP_USER' | 'PHONE_NUMBER';
    timeout?: number;
  }): BridgeBlock;

  /**
   * Create a HANGUP block
   */
  hangup(reason?: string): HangupBlock;

  /**
   * Provider name for logging/debugging
   */
  readonly name: string;
}
