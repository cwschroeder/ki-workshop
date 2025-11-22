import { z } from 'zod';

export const TranscriptionSchema = z.object({
  call_id: z.string(),
  timestamp: z.string(),
  speaker: z.string(),
  text: z.string(),
  confidence: z.coerce.number()
});

export type Transcription = z.infer<typeof TranscriptionSchema>;
