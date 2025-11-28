/**
 * AI Provider Exports
 *
 * Central export file for all AI-related providers and interfaces.
 */

// Interfaces
export type { IAIProvider, ChatMessage, TranscribeOptions, SynthesizeOptions, ChatOptions, ExtractedInfo } from './IAIProvider';
export type { ISTTProvider } from './ISTTProvider';
export type { ITTSProvider } from './ITTSProvider';
export type { ILLMProvider } from './ILLMProvider';

// Legacy Providers (combined STT/TTS/LLM)
export { OpenAIProvider } from './OpenAIProvider';
export { LocalLLMProvider } from './LocalLLMProvider';
export { CompositeAIProvider } from './CompositeAIProvider';

// STT Providers
export { OpenAISTTProvider } from './stt/OpenAISTTProvider';
export { FasterWhisperProvider } from './stt/FasterWhisperProvider';

// TTS Providers
export { OpenAITTSProvider } from './tts/OpenAITTSProvider';
export { CoquiTTSProvider } from './tts/CoquiTTSProvider';

// LLM Providers
export { OpenAILLMProvider } from './llm/OpenAILLMProvider';
export { OllamaLLMProvider } from './llm/OllamaLLMProvider';
