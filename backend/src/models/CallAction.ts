/**
 * Call Action Models
 *
 * Actions that clients can send to control active calls
 */

export type CallActionType =
  | 'say'
  | 'collect_speech'
  | 'collect_digits'
  | 'transfer'
  | 'hangup'
  | 'ai_conversation';

export interface SayAction {
  type: 'say';
  text: string;
  voice?: string;
}

export interface CollectSpeechAction {
  type: 'collect_speech';
  prompt?: string;
  language?: string;
  timeout?: number;
}

export interface CollectDigitsAction {
  type: 'collect_digits';
  prompt?: string;
  maxDigits: number;
  timeout?: number;
  allowSpeech?: boolean;
}

export interface TransferAction {
  type: 'transfer';
  destination: string;
  destinationType?: 'SIP_USER' | 'PHONE_NUMBER';
}

export interface HangupAction {
  type: 'hangup';
  message?: string;
}

export interface AIConversationAction {
  type: 'ai_conversation';
  systemPrompt: string;
  maxTurns?: number;
}

export type CallAction =
  | SayAction
  | CollectSpeechAction
  | CollectDigitsAction
  | TransferAction
  | HangupAction
  | AIConversationAction;
