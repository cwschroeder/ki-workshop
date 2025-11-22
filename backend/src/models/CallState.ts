export enum CallStep {
  GREETING = 'greeting',
  REQUEST_CUSTOMER_NUMBER = 'request_customer_number',
  REQUEST_METER_NUMBER = 'request_meter_number',
  REQUEST_READING = 'request_reading',
  CONFIRM_READING = 'confirm_reading',
  COMPLETED = 'completed',
  ERROR = 'error'
}

export interface CallState {
  callId: string;
  step: CallStep;
  customerNumber?: string;
  meterNumber?: string;
  readingValue?: string;
  retryCount: number;
  transcript: Array<{
    timestamp: string;
    speaker: 'system' | 'user';
    text: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
