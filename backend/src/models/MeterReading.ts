import { z } from 'zod';

export const MeterReadingSchema = z.object({
  customer_number: z.string().min(1),
  meter_number: z.string().min(1),
  reading_value: z.string().min(1),
  reading_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reading_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  call_id: z.string().min(1)
});

export type MeterReading = z.infer<typeof MeterReadingSchema>;
