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
  HangupBlock
} from './ITelephonyProvider';

export class TeniosProvider implements ITelephonyProvider {
  readonly name = 'TENIOS';

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
    return {
      callId: body.callControlUuid || body.variables?.call_uuid || '',
      callUuid: body.variables?.call_uuid,
      from: body.variables?.caller_id_number,
      to: body.variables?.destination_number,
      loopCount: body.loopCount || 0,
      userInput: body.variables?.collected_user_input,
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
   */
  collectDigits(options: {
    maxDigits: number;
    minDigits?: number;
    timeout?: number;
    prompt?: string;
    allowSpeech?: boolean;
    speechLanguage?: string;
  }): CollectDigitsBlock {
    const block: CollectDigitsBlock = {
      blockType: 'COLLECT_DIGITS',
      maxDigits: options.maxDigits,
      minDigits: options.minDigits ?? 1,
      timeout: options.timeout ?? 10,
      finishOnKey: '#'
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
   */
  bridge(destination: string, options?: {
    destinationType?: 'SIP_USER' | 'PHONE_NUMBER';
    timeout?: number;
  }): BridgeBlock {
    return {
      blockType: 'BRIDGE',
      bridgeMode: 'SEQUENTIAL',
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
}
