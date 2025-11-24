/**
 * TENIOS Provider Implementation
 *
 * Implements the TENIOS Call Control API
 * Documentation: https://www.tenios.de/doc/external-call-control-api
 */

import type {
  ITelephonyProvider,
  TelephonyBlock,
  CallControlResponse,
  IncomingCallData,
  SayBlock,
  CollectSpeechBlock,
  CollectDigitsBlock,
  BridgeBlock,
  HangupBlock,
  AnnouncementBlock,
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
} from './ITelephonyProvider';

export class TeniosProvider implements ITelephonyProvider {
  readonly name = 'TENIOS';

  constructor(
    private apiKey: string,
    private accountSid?: string,
    private authToken?: string
  ) {}

  /**
   * Create TENIOS Call Control response
   */
  createResponse(blocks: TelephonyBlock[]): CallControlResponse {
    return { blocks };
  }

  /**
   * Parse TENIOS webhook payload
   */
  parseIncomingCall(body: any): IncomingCallData {
    // TENIOS sends user input with "collected_" prefix + variableName
    // e.g. "collected_collected_user_input" for variableName="collected_user_input"
    const userInput = body.variables?.collected_collected_user_input
      || body.variables?.collected_user_input;

    return {
      callId: body.callControlUuid || body.variables?.call_uuid || '',
      callUuid: body.variables?.call_uuid,
      from: body.variables?.caller_id_number,
      to: body.variables?.destination_number,
      loopCount: body.loopCount || 0,
      userInput,
      variables: body.variables || {}
    };
  }

  /**
   * Create SAY block (Text-to-Speech)
   */
  say(text: string, options?: { voice?: string; useSsml?: boolean }): SayBlock {
    return {
      blockType: 'SAY',
      text,
      voiceName: options?.voice || 'de.female.2',
      useSsml: options?.useSsml ?? false
    };
  }

  /**
   * Create COLLECT_SPEECH block (ASR - Automatic Speech Recognition)
   */
  collectSpeech(options: {
    language: string;
    timeout?: number;
    maxTries?: number;
    prompt?: string;
  }): CollectSpeechBlock {
    return {
      blockType: 'COLLECT_SPEECH',
      asrProvider: 'GOOGLE', // TENIOS supports GOOGLE, MICROSOFT, AWS
      language: options.language,
      variableName: 'collected_user_input',
      maxTries: options.maxTries ?? 2,
      timeout: options.timeout ?? 10
    };
  }

  /**
   * Create COLLECT_DIGITS block (DTMF digit collection)
   *
   * IMPORTANT: TENIOS requires announcementName and errorAnnouncementName
   * to reference pre-configured announcements in the TENIOS portal.
   * Use SAY blocks BEFORE this block for custom prompts.
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
  }): CollectDigitsBlock {
    const block: CollectDigitsBlock = {
      blockType: 'COLLECT_DIGITS',
      maxDigits: options.maxDigits,
      minDigits: options.minDigits ?? 1,
      timeout: options.timeout ?? 10,
      variableName: 'collected_user_input',
      terminator: '#',
      maxTries: 1,
      // Use predefined announcements from TENIOS portal
      announcementName: options.announcementName || 'IVU_TEST_1',
      errorAnnouncementName: options.errorAnnouncementName || 'IVU_TEST_1'
    };

    // Hybrid mode: Allow both DTMF and speech input
    if (options.allowSpeech) {
      block.allowSpeechInput = true;
      block.speechOptions = {
        asrProvider: 'GOOGLE',
        language: options.speechLanguage || 'de-DE',
        variableName: 'collected_user_input'
      };
    }

    return block;
  }

  /**
   * Create BRIDGE block (call transfer)
   *
   * Bridge modes:
   * - SEQUENTIAL: Try destinations one after another until one answers
   *   Example: Try SIP user first, if no answer try phone number
   *
   * - PARALLEL: Ring all destinations simultaneously (first to answer wins)
   *   Example: Ring multiple phones at once (sales team, support team, etc.)
   *
   * Note: Currently only supports single destination. For multiple destinations,
   * you would need to modify the TENIOS block to include multiple destinations:
   *
   * SEQUENTIAL example (try one after another):
   *   destinations: [
   *     { destination: 'alice', destinationType: 'SIP_USER', timeout: 20 },
   *     { destination: 'bob', destinationType: 'SIP_USER', timeout: 20 },
   *     { destination: '+4940123456', destinationType: 'PHONE_NUMBER', timeout: 30 }
   *   ]
   *
   * PARALLEL example (ring all at once):
   *   destinations: [
   *     { destination: 'alice', destinationType: 'SIP_USER', timeout: 30 },
   *     { destination: 'bob', destinationType: 'SIP_USER', timeout: 30 },
   *     { destination: '+4940123456', destinationType: 'PHONE_NUMBER', timeout: 30 }
   *   ]
   */
  bridge(destination: string, options?: {
    destinationType?: 'SIP_USER' | 'PHONE_NUMBER';
    timeout?: number;
    bridgeMode?: 'SEQUENTIAL' | 'PARALLEL';
  }): BridgeBlock {
    return {
      blockType: 'BRIDGE',
      bridgeMode: options?.bridgeMode || 'SEQUENTIAL',
      destinations: [
        {
          destination,
          destinationType: options?.destinationType || 'SIP_USER',
          timeout: options?.timeout ?? 30
        }
      ]
    };
  }

  /**
   * Create HANGUP block (end call)
   */
  hangup(reason?: string): HangupBlock {
    // TENIOS HANGUP block accepts no parameters, just blockType
    return {
      blockType: 'HANGUP'
    };
  }

  /**
   * Create ANNOUNCEMENT block (play pre-recorded audio)
   */
  playAnnouncement(announcementName: string): AnnouncementBlock {
    return {
      blockType: 'ANNOUNCEMENT',
      announcementName
    };
  }


  /**
   * Make an outbound call using TENIOS MakeCall API
   *
   * This initiates an outbound call via HTTP API (not a Call Control block).
   *
   * How it works:
   * 1. TENIOS calls the destination_number (Leg A)
   * 2. When destination answers, TENIOS calls the tenios_number (Leg B)
   * 3. The routing plan configured for tenios_number is executed
   * 4. Both legs are bridged together
   *
   * Use cases:
   * - Click-to-call functionality
   * - Automated outbound campaigns
   * - Reminder/notification calls
   * - Conference call initiation
   *
   * Documentation: https://www.tenios.de/doc/makecall-api
   *
   * @param options MakeCall parameters
   * @returns Promise with callback_id for tracking
   */
  async makeCall(options: MakeCallOptions): Promise<MakeCallResponse> {
    const url = 'https://api.tenios.com/makecall/init';

    const body = {
      access_key: this.apiKey,
      destination_number: options.destinationNumber,
      tenios_number: options.teniosNumber,
      ...(options.callerId && { caller_id: options.callerId }),
      ...(options.callstateInfoUrl && { callstate_info_url: options.callstateInfoUrl }),
      ...(options.destinationOriginationTimeout && {
        destination_origination_timeout: options.destinationOriginationTimeout
      })
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TENIOS MakeCall API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { id: number };
    return { id: data.id };
  }

  /**
   * Send SMS message using TENIOS SMS API
   *
   * This sends an SMS via HTTP API (not a Call Control block).
   *
   * How it works:
   * 1. Uses TENIOS SMS API v2 endpoint
   * 2. Requires Account-SID and Auth Token (different from Voice API key)
   * 3. Uses HTTP Basic Authentication
   * 4. Messages >160 GSM-7 chars are automatically segmented
   *
   * Use cases:
   * - Send confirmation SMS after call
   * - Send appointment reminders
   * - Send verification codes
   * - Send notifications
   *
   * Documentation: https://www.tenios.de/en/doc/smsapi
   *
   * ⚠️  REQUIRES ACTIVATION:
   * The SMS API must be enabled for your TENIOS account.
   * Contact TENIOS customer support to request activation and receive
   * your Account-SID and Auth Token credentials.
   *
   * @param options SMS parameters
   * @returns Promise with message URI and status
   */
  async sendSMS(options: SendSMSOptions): Promise<SendSMSResponse> {
    if (!this.accountSid || !this.authToken) {
      throw new Error(
        'TENIOS SMS API requires Account-SID and Auth Token. ' +
        'These credentials must be provided to TeniosProvider constructor. ' +
        'Contact TENIOS support to enable SMS API and receive credentials.'
      );
    }

    const url = `https://sms-api.tenios.com/v2/accounts/${this.accountSid}/messages`;

    const body = {
      from: options.from,
      to: options.to,
      text: options.text,
      ...(options.tag && { tag: options.tag })
    };

    // Create Basic Auth header
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TENIOS SMS API error: ${response.status} ${errorText}`);
    }

    const location = response.headers.get('Location') || '';

    return {
      messageUri: location,
      status: response.status
    };
  }

  /**
   * Start call recording using TENIOS Recording API
   *
   * This starts recording an ongoing call via HTTP API.
   *
   * How it works:
   * 1. Call must be active (have a call_uuid)
   * 2. Can record caller, callee, or both channels
   * 3. Returns recording_uuid for stopping/retrieving the recording
   * 4. Can be started/stopped multiple times on the same call
   *
   * Use cases:
   * - Record specific parts of a conversation
   * - Compliance recording with start/stop control
   * - Quality assurance for selected interactions
   *
   * Documentation: https://www.tenios.de/en/doc/api-call-recording
   *
   * @param options Recording parameters
   * @returns Promise with recording UUID
   */
  async startRecording(options: StartRecordingOptions): Promise<StartRecordingResponse> {
    const url = 'https://api.tenios.com/record-call/start';

    const body = {
      access_key: this.apiKey,
      call_uuid: options.callUuid,
      ...(options.recordCaller !== undefined && { record_caller: options.recordCaller }),
      ...(options.recordCallee !== undefined && { record_callee: options.recordCallee })
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TENIOS Recording API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { recording_uuid: string };
    return { recordingUuid: data.recording_uuid };
  }

  /**
   * Stop call recording using TENIOS Recording API
   *
   * Stops an ongoing recording on a call.
   *
   * @param options Stop recording parameters
   * @returns Promise with success status
   */
  async stopRecording(options: StopRecordingOptions): Promise<StopRecordingResponse> {
    const url = 'https://api.tenios.com/record-call/stop';

    const body = {
      access_key: this.apiKey,
      call_uuid: options.callUuid,
      recording_uuid: options.recordingUuid
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TENIOS Stop Recording API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { success: boolean | string };
    return { success: data.success === 'true' || data.success === true };
  }

  /**
   * Retrieve call recording using TENIOS Recording API
   *
   * Retrieves the audio file for a recording.
   * Returns the recording as a Buffer with content type.
   *
   * @param options Retrieve recording parameters
   * @returns Promise with recording data and content type
   */
  async retrieveRecording(options: RetrieveRecordingOptions): Promise<RetrieveRecordingResponse> {
    const url = 'https://api.tenios.com/record-call/retrieve';

    const body = {
      access_key: this.apiKey,
      recording_uuid: options.recordingUuid
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TENIOS Retrieve Recording API error: ${response.status} ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      data: buffer,
      contentType
    };
  }
}
