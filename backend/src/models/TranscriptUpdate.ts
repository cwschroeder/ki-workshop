export type TranscriptStatus = 'interim' | 'final';

export interface TranscriptUpdate {
  type: 'transcript_update';
  sessionId: string;
  speaker: string;
  text: string;
  utteranceId: string;
  revision: number;
  startedAt: string;
  receivedAt: string;
  status: TranscriptStatus;
  source?: string;
}
