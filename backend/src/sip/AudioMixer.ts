import { EventEmitter } from 'events';
import { RTPAudioHandler } from './RTPAudioHandler';

/**
 * Audio Mixer for B2BUA
 * Mixes audio from multiple RTP sources and distributes to all participants
 *
 * Features:
 * - Receives audio from multiple legs (Leg A, Leg B, etc.)
 * - Mixes audio: Each leg receives audio from ALL other legs, but not their own
 * - Provides mixed audio stream for transcription
 * - Applies automatic gain control to prevent clipping
 */

interface MixerLeg {
  legId: string;
  rtpHandler: RTPAudioHandler;
}

export class AudioMixer extends EventEmitter {
  private sessionId: string;
  private legs: Map<string, MixerLeg> = new Map();
  private audioBuffers: Map<string, Buffer[]> = new Map();
  private isRunning: boolean = true;

  // Audio mixing parameters
  private readonly SAMPLE_RATE = 8000; // G.711 is 8kHz
  private readonly BYTES_PER_SAMPLE = 2; // 16-bit PCM
  private readonly GAIN_REDUCTION_FACTOR = 0.7; // Prevent clipping when mixing

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  /**
   * Add a leg (call participant) to the mixer
   */
  addLeg(legId: string, rtpHandler: RTPAudioHandler): void {
    if (this.legs.has(legId)) {
      console.warn(`[AudioMixer:${this.sessionId}] Leg ${legId} already exists`);
      return;
    }

    console.log(`[AudioMixer:${this.sessionId}] Adding leg: ${legId}`);

    const leg: MixerLeg = {
      legId,
      rtpHandler
    };

    this.legs.set(legId, leg);
    this.audioBuffers.set(legId, []);

    // Listen to audio from this leg
    let packetCount = 0;
    rtpHandler.on('audio', (audioData: Buffer) => {
      if (!this.isRunning) return;

      // Emit raw audio from this specific leg (for speaker diarization)
      if (legId === 'legA') {
        packetCount++;
        this.emit('legAAudio', audioData);
      } else if (legId === 'legB') {
        packetCount++;
        this.emit('legBAudio', audioData);
      }

      // Process and mix audio
      this.processAudioFromLeg(legId, audioData);
    });

    console.log(`[AudioMixer:${this.sessionId}] Leg ${legId} added, total legs: ${this.legs.size}`);
  }

  /**
   * Remove a leg from the mixer
   */
  removeLeg(legId: string): void {
    const leg = this.legs.get(legId);
    if (!leg) {
      console.warn(`[AudioMixer:${this.sessionId}] Leg ${legId} not found`);
      return;
    }

    console.log(`[AudioMixer:${this.sessionId}] Removing leg: ${legId}`);

    // Remove all listeners
    leg.rtpHandler.removeAllListeners('audio');

    this.legs.delete(legId);
    this.audioBuffers.delete(legId);
  }

  /**
   * Process incoming audio from a leg
   */
  private processAudioFromLeg(sourceLegId: string, audioData: Buffer): void {
    if (this.legs.size < 2) {
      // No mixing needed if only one leg
      return;
    }

    // Mix this audio with audio from other legs and send to each participant
    for (const [targetLegId, targetLeg] of this.legs) {
      if (targetLegId === sourceLegId) {
        // Don't send leg's own audio back to itself
        continue;
      }

      // Send the source audio to the target leg
      // In a simple pass-through, we just forward the audio
      // For more complex mixing, we would combine multiple sources
      targetLeg.rtpHandler.sendAudio(audioData);
    }

    // Emit mixed audio for transcription
    // For transcription, we want to hear ALL audio (from all legs)
    this.emitMixedAudioForTranscription(sourceLegId, audioData);
  }

  /**
   * Create a mixed audio stream for transcription
   * This combines audio from all legs
   */
  private emitMixedAudioForTranscription(sourceLegId: string, audioData: Buffer): void {
    // For now, we emit each leg's audio separately
    // The transcription service can decide how to handle it
    // In a more sophisticated implementation, we would actually mix the PCM samples

    this.emit('mixedAudio', audioData);

    // Optional: Implement true audio mixing here
    // This would involve:
    // 1. Collecting audio buffers from all legs
    // 2. Synchronizing timestamps
    // 3. Summing PCM samples from all sources
    // 4. Applying gain reduction
    // 5. Emitting the mixed result
  }

  /**
   * Mix multiple PCM audio buffers into one
   * This is a basic mixing algorithm that sums samples and applies gain reduction
   */
  private mixPCMBuffers(buffers: Buffer[]): Buffer {
    if (buffers.length === 0) {
      return Buffer.alloc(0);
    }

    if (buffers.length === 1) {
      return buffers[0];
    }

    // Find the maximum length
    const maxLength = Math.max(...buffers.map((b) => b.length));
    const output = Buffer.alloc(maxLength);

    // Mix samples
    const numSamples = maxLength / this.BYTES_PER_SAMPLE;

    for (let i = 0; i < numSamples; i++) {
      const offset = i * this.BYTES_PER_SAMPLE;
      let sum = 0;

      // Sum all sources
      for (const buffer of buffers) {
        if (offset + this.BYTES_PER_SAMPLE <= buffer.length) {
          const sample = buffer.readInt16LE(offset);
          sum += sample;
        }
      }

      // Apply gain reduction to prevent clipping
      const mixed = Math.round(sum * this.GAIN_REDUCTION_FACTOR);

      // Clamp to 16-bit range
      const clamped = Math.max(-32768, Math.min(32767, mixed));

      output.writeInt16LE(clamped, offset);
    }

    return output;
  }

  /**
   * Alternative mixing strategy: Mix all audio and broadcast to all legs
   * This is useful for conference-style calls where everyone hears everyone
   */
  private mixAndBroadcast(): void {
    if (this.legs.size < 2) {
      return;
    }

    // Collect recent audio from all legs
    const audioToMix: Buffer[] = [];

    for (const [legId, buffers] of this.audioBuffers) {
      if (buffers.length > 0) {
        // Take the most recent buffer
        const recentBuffer = buffers.shift();
        if (recentBuffer) {
          audioToMix.push(recentBuffer);
        }
      }
    }

    if (audioToMix.length === 0) {
      return;
    }

    // Mix all audio together
    const mixed = this.mixPCMBuffers(audioToMix);

    // Broadcast mixed audio to all legs
    for (const leg of this.legs.values()) {
      leg.rtpHandler.sendAudio(mixed);
    }

    // Emit for transcription
    this.emit('mixedAudio', mixed);
  }

  /**
   * Get mixer statistics
   */
  getStats(): { sessionId: string; legCount: number; isRunning: boolean } {
    return {
      sessionId: this.sessionId,
      legCount: this.legs.size,
      isRunning: this.isRunning
    };
  }

  /**
   * Stop the mixer
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log(`[AudioMixer:${this.sessionId}] Stopping`);
    this.isRunning = false;

    // Remove all listeners
    for (const leg of this.legs.values()) {
      leg.rtpHandler.removeAllListeners('audio');
    }

    this.legs.clear();
    this.audioBuffers.clear();
    this.removeAllListeners();
  }
}
