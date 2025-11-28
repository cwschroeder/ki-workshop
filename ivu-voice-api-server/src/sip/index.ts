/**
 * SIP Module Exports
 *
 * Provides all SIP/RTP related functionality for Tenios Voice Bot integration
 */

export { SIPServerService } from './SIPServerService';
export { RTPAudioHandler } from './RTPAudioHandler';
export { VADBuffer, type VADBufferOptions } from './VADBuffer';
export { AudioMixer } from './AudioMixer';
export { VoiceAgentPipeline, type VoicePipelineOptions } from './VoiceAgentPipeline';
export {
  PassiveListenerPipeline,
  type PassiveListenerOptions
} from './PassiveListenerPipeline';
export {
  pcmToWav,
  wavToPcm,
  mp3ToPcm8k,
  audioToPcm8k,
  resamplePcm,
  getAudioDurationMs,
  calculateRms,
  rmsToDb
} from './AudioUtils';
