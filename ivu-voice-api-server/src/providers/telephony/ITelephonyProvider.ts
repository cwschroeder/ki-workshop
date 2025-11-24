/**
 * Telephony Provider Interface
 *
 * This interface abstracts telephony operations to allow
 * easy switching between providers (TENIOS, Twilio, Vonage, etc.)
 */

export type BlockType = 'SAY' | 'COLLECT_SPEECH' | 'COLLECT_DIGITS' | 'BRIDGE' | 'HANGUP' | 'ANNOUNCEMENT';

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
  // TENIOS-specific fields
  variableName?: string;
  terminator?: string;
  maxTries?: number;
  announcementName?: string;
  errorAnnouncementName?: string;
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

export interface AnnouncementBlock {
  blockType: 'ANNOUNCEMENT';
  announcementName: string;
}

export type TelephonyBlock =
  | SayBlock
  | CollectSpeechBlock
  | CollectDigitsBlock
  | BridgeBlock
  | HangupBlock
  | AnnouncementBlock;

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

export interface MakeCallOptions {
  destinationNumber: string;
  teniosNumber: string;
  callerId?: string;
  callstateInfoUrl?: string;
  destinationOriginationTimeout?: number;
}

export interface MakeCallResponse {
  id: number;
}

export interface SendSMSOptions {
  from: string;
  to: string;
  text: string;
  tag?: string;
}

export interface SendSMSResponse {
  messageUri: string;
  status: number;
}

export interface StartRecordingOptions {
  callUuid: string;
  recordCaller?: boolean;
  recordCallee?: boolean;
}

export interface StartRecordingResponse {
  recordingUuid: string;
}

export interface StopRecordingOptions {
  callUuid: string;
  recordingUuid: string;
}

export interface StopRecordingResponse {
  success: boolean;
}

export interface RetrieveRecordingOptions {
  recordingUuid: string;
}

export interface RetrieveRecordingResponse {
  data: Buffer;
  contentType: string;
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
    announcementName?: string;
    errorAnnouncementName?: string;
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
   * Create an ANNOUNCEMENT block (play pre-recorded audio)
   */
  playAnnouncement(announcementName: string): AnnouncementBlock;

  /**
   * Make an outbound call (HTTP API call)
   */
  makeCall(options: MakeCallOptions): Promise<MakeCallResponse>;

  /**
   * Send SMS message (HTTP API call)
   */
  sendSMS(options: SendSMSOptions): Promise<SendSMSResponse>;

  /**
   * Start call recording (HTTP API call)
   */
  startRecording(options: StartRecordingOptions): Promise<StartRecordingResponse>;

  /**
   * Stop call recording (HTTP API call)
   */
  stopRecording(options: StopRecordingOptions): Promise<StopRecordingResponse>;

  /**
   * Retrieve call recording (HTTP API call)
   */
  retrieveRecording(options: RetrieveRecordingOptions): Promise<RetrieveRecordingResponse>;

  /**
   * Provider name for logging/debugging
   */
  readonly name: string;
}
