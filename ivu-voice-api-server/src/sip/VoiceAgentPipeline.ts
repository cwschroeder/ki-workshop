import { EventEmitter } from 'events';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { ISTTProvider } from '../providers/ai/ISTTProvider';
import type { ILLMProvider } from '../providers/ai/ILLMProvider';
import type { ITTSProvider } from '../providers/ai/ITTSProvider';
import type { ChatMessage } from '../providers/ai/IAIProvider';
import { RTPAudioHandler } from './RTPAudioHandler';
import { pcmToWav, mp3ToPcm8k } from './AudioUtils';

export interface VoicePipelineOptions {
  /**
   * If true, only transcribe audio without LLM/TTS responses
   * Useful for passive monitoring/transcription of calls
   */
  listenOnlyMode?: boolean;

  /**
   * Speaker identifier for transcription events (e.g., 'customer', 'agent')
   */
  speakerLabel?: string;

  /**
   * Custom system prompt for the LLM
   * If not provided, uses default agent prompt
   */
  systemPrompt?: string;

  /**
   * If true, skip sending the initial greeting
   * Useful for customer-side pipelines that should wait for agent greeting
   */
  skipGreeting?: boolean;

  /**
   * Provider selection - allows runtime switching
   */
  sttProvider?: string; // 'openai' | 'whisper'
  llmProvider?: string; // 'openai' | 'ollama'
  ttsProvider?: string; // 'openai' | 'coqui'
}

/**
 * Voice Agent Pipeline
 * Orchestrates the STT → LLM → TTS flow with Voice Activity Detection
 * Uses ProviderRegistry for runtime provider selection
 */
export class VoiceAgentPipeline extends EventEmitter {
  private registry: ProviderRegistry;
  private sttProvider: ISTTProvider;
  private llmProvider: ILLMProvider;
  private ttsProvider: ITTSProvider;
  private rtpHandler: RTPAudioHandler;
  private callId: string;
  private options: VoicePipelineOptions;

  private conversationHistory: ChatMessage[] = [];
  private audioBuffer: Buffer = Buffer.alloc(0);
  private isProcessing: boolean = false;
  private isSpeaking: boolean = false;
  private isStopped: boolean = false;
  private shouldInterrupt: boolean = false;
  private speakingStartTime: number = 0;

  private readonly SAMPLE_RATE = 8000;
  private readonly LANGUAGE = 'de';
  private readonly INTERRUPT_THRESHOLD = this.SAMPLE_RATE * 2 * 3; // 3 seconds to interrupt
  private readonly INTERRUPT_COOLDOWN_MS = 1000; // 1 second cooldown before allowing interrupts

  constructor(
    callId: string,
    rtpHandler: RTPAudioHandler,
    registry: ProviderRegistry,
    options: VoicePipelineOptions = {}
  ) {
    super();
    this.callId = callId;
    this.rtpHandler = rtpHandler;
    this.registry = registry;
    this.options = options;

    // Get providers from registry
    const sttName = options.sttProvider || 'openai';
    const llmName = options.llmProvider || 'openai';
    const ttsName = options.ttsProvider || 'openai';

    this.sttProvider = registry.getSTT(sttName);
    this.llmProvider = registry.getLLM(llmName);
    this.ttsProvider = registry.getTTS(ttsName);

    console.log(
      `[VoiceAgentPipeline:${callId}] Initialized with STT=${sttName}, LLM=${llmName}, TTS=${ttsName}`
    );
  }

  /**
   * Start the voice agent pipeline
   */
  async start(): Promise<void> {
    const mode = this.options.listenOnlyMode ? 'listen-only' : 'interactive';
    console.log(
      `[VoiceAgentPipeline:${this.callId}] Starting in ${mode} mode, speaker: ${this.options.speakerLabel || 'user'}`
    );

    // Listen for incoming audio
    this.rtpHandler.on('audio', (audioData: Buffer) => {
      this.handleIncomingAudio(audioData);
    });

    // In listen-only mode, skip greeting and LLM setup
    if (this.options.listenOnlyMode) {
      console.log(`[VoiceAgentPipeline:${this.callId}] Listen-only mode: only transcribing`);
      return;
    }

    // Interactive mode: Set system prompt
    const systemPrompt =
      this.options.systemPrompt ||
      `Du bist ein freundlicher Kundenservice-Agent des Stadtwerks.

Ziel: Zählerstand aufnehmen (Zählerwert und Zählernummer).

Ablauf:
1. Begrüßung: "Guten Tag. Willkommen beim Stadtwerk. Möchten Sie Ihren Zählerstand melden?"
2. Wenn Kunde bestätigt → direkt nach dem Zählerstand-Wert fragen
3. Zählerstand erhalten → kurz bestätigen und nach Zählernummer fragen
4. Zählernummer erhalten → kurz bestätigen und Gespräch beenden

Wichtig:
- Höre auf den Kunden! Wenn er bereits seine Absicht nennt ("Ich möchte meinen Zählerstand melden"), NICHT nochmal nachfragen, sondern direkt zum nächsten Schritt übergehen
- Stelle nur eine Frage pro Antwort
- Keine doppelten Begrüßungen, keine Füllfloskeln
- Antworte in max. 1-2 kurzen Sätzen
- Wiederhole erkannte Zahlen zur Bestätigung (z.B. "Zählerstand 12345, verstanden")

Sprich auf Deutsch.`;

    this.conversationHistory.push({
      role: 'system',
      content: systemPrompt
    });

    // Send a short burst of silence immediately to open RTP path
    this.rtpHandler.sendSilence(200).catch((err) => {
      console.warn(`[VoiceAgentPipeline:${this.callId}] Failed to send RTP priming silence:`, err);
    });

    // Send greeting (unless skipped)
    if (!this.options.skipGreeting) {
      await this.sendGreeting();
    }
  }

  /**
   * Send initial greeting
   */
  private async sendGreeting(): Promise<void> {
    const greeting = 'Guten Tag. Willkommen beim Stadtwerk. Möchten Sie Ihren Zählerstand melden?';
    this.conversationHistory.push({ role: 'assistant', content: greeting });
    await this.speak(greeting);
  }

  /**
   * Handle incoming audio from RTP
   */
  private handleIncomingAudio(audioData: Buffer): void {
    // ALWAYS buffer incoming audio (full-duplex)
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioData]);

    // Don't process while already processing
    if (this.isProcessing) {
      return;
    }

    // Check for interrupt if agent is speaking
    if (this.isSpeaking) {
      // Only allow interrupts after cooldown period
      const timeSpoken = Date.now() - this.speakingStartTime;
      if (timeSpoken >= this.INTERRUPT_COOLDOWN_MS) {
        // If user speaks for 3 seconds while agent talks, trigger interrupt
        if (this.audioBuffer.length >= this.INTERRUPT_THRESHOLD) {
          console.log(
            `[VoiceAgentPipeline:${this.callId}] User interrupting agent, buffer: ${this.audioBuffer.length} bytes`
          );
          this.shouldInterrupt = true;
          return;
        }
      }
    }

    // VAD: Check if we have enough audio (2 seconds)
    const minBufferSize = this.SAMPLE_RATE * 2 * 2; // 2 seconds, 16-bit samples

    if (this.audioBuffer.length >= minBufferSize) {
      // Process the buffered audio
      this.processAudioBuffer();
    }
  }

  /**
   * Process accumulated audio buffer
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const audioToProcess = this.audioBuffer;
      this.audioBuffer = Buffer.alloc(0); // Clear buffer

      // Convert PCM to WAV for STT (some providers need WAV format)
      const wavBuffer = pcmToWav(audioToProcess, this.SAMPLE_RATE);

      // Transcribe
      console.log(
        `[VoiceAgentPipeline:${this.callId}] Transcribing ${audioToProcess.length} bytes of audio`
      );
      const transcription = await this.sttProvider.transcribe(wavBuffer, {
        language: this.LANGUAGE
      });

      if (!transcription || transcription.trim() === '') {
        console.log(`[VoiceAgentPipeline:${this.callId}] Empty transcription`);
        this.isProcessing = false;
        return;
      }

      console.log(
        `[VoiceAgentPipeline:${this.callId}] Transcribed (${this.options.speakerLabel || 'user'}): ${transcription}`
      );

      // Emit transcription event for external consumers
      this.emit('transcription', {
        callId: this.callId,
        speaker: this.options.speakerLabel || 'user',
        text: transcription,
        timestamp: new Date()
      });

      // In listen-only mode, skip LLM and TTS
      if (this.options.listenOnlyMode) {
        this.isProcessing = false;
        return;
      }

      // Interactive mode: Continue with LLM and TTS
      this.conversationHistory.push({ role: 'user', content: transcription });

      // Get LLM response
      const response = await this.llmProvider.chat(this.conversationHistory);
      console.log(`[VoiceAgentPipeline:${this.callId}] Agent responds: ${response}`);
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Emit event when agent responds (before speaking)
      this.emit('agentResponse', {
        callId: this.callId,
        speaker: this.options.speakerLabel || 'assistant',
        text: response,
        timestamp: new Date()
      });

      // Speak response
      await this.speak(response);
    } catch (error) {
      console.error(`[VoiceAgentPipeline:${this.callId}] Error processing audio:`, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Generate speech and send via RTP
   */
  private async speak(text: string): Promise<void> {
    if (this.isStopped) {
      console.warn(`[VoiceAgentPipeline:${this.callId}] Skipping speak: pipeline stopped`);
      return;
    }

    const startedAt = Date.now();

    try {
      console.log(`[VoiceAgentPipeline:${this.callId}] Generating speech for: ${text}`);

      // Generate TTS
      const audioBuffer = await this.ttsProvider.synthesize(text, {
        voice: 'nova',
        language: this.LANGUAGE
      });

      if (this.isStopped) {
        console.warn(`[VoiceAgentPipeline:${this.callId}] Discarding speech: pipeline stopped`);
        return;
      }

      // Convert TTS output (likely MP3) to PCM 8kHz for RTP
      const pcmAudio = await mp3ToPcm8k(audioBuffer);

      // Clear any buffered audio BEFORE starting to speak
      this.audioBuffer = Buffer.alloc(0);

      // NOW we start speaking and check for interrupts
      this.speakingStartTime = Date.now();
      this.isSpeaking = true;
      this.shouldInterrupt = false;

      // Stream audio in chunks via RTP
      const chunkSize = 320; // 20ms at 8kHz, 16-bit = 320 bytes
      let offset = 0;
      let packets = 0;

      // Mark start of talkspurt so RTP sets marker bit
      this.rtpHandler.setMarkerForNextPacket();

      while (offset < pcmAudio.length) {
        // Check for interrupts or stop
        if (this.isStopped) {
          console.warn(
            `[VoiceAgentPipeline:${this.callId}] Stopping speech mid-playback: pipeline stopped`
          );
          break;
        }

        if (this.shouldInterrupt) {
          console.log(
            `[VoiceAgentPipeline:${this.callId}] Speech interrupted after ${Date.now() - startedAt}ms`
          );
          break;
        }

        const chunk = pcmAudio.slice(offset, offset + chunkSize);
        this.rtpHandler.sendAudio(chunk);
        packets += 1;

        // Wait 20ms between chunks for real-time playback
        await new Promise((resolve) => setTimeout(resolve, 20));

        offset += chunkSize;
      }

      if (!this.isStopped && !this.shouldInterrupt) {
        console.log(
          `[VoiceAgentPipeline:${this.callId}] Speech completed: ${packets} packets, ${Date.now() - startedAt}ms`
        );
      }
    } catch (error) {
      console.error(`[VoiceAgentPipeline:${this.callId}] Error generating speech:`, error);
    } finally {
      this.isSpeaking = false;

      // If interrupted, process the buffered user audio immediately
      if (this.shouldInterrupt && this.audioBuffer.length > 0) {
        console.log(`[VoiceAgentPipeline:${this.callId}] Processing user input after interrupt`);
        this.shouldInterrupt = false;
        await new Promise((resolve) => setTimeout(resolve, 100));
        this.processAudioBuffer();
      }
    }
  }

  /**
   * Stop the pipeline
   */
  async stop(): Promise<void> {
    console.log(`[VoiceAgentPipeline:${this.callId}] Stopping`);
    this.isStopped = true;
    this.rtpHandler.removeAllListeners('audio');
    this.conversationHistory = [];
    this.audioBuffer = Buffer.alloc(0);
  }
}
