import { z } from 'zod';

export const CustomerSchema = z.object({
  customer_number: z.string().min(1),
  meter_number: z.string().min(1),
  customer_name: z.string().min(1)
});

export type Customer = z.infer<typeof CustomerSchema>;
