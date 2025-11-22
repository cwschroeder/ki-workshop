import { CallStateManager } from './CallStateManager';
import { OpenAIService } from './OpenAIService';
import { CsvService } from './CsvService';
import { CallStep } from '../models/CallState';
import { PROMPTS, MAX_RETRIES } from '../config/constants';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'CallFlowService' });

export class CallFlowService {
  constructor(
    private callStateManager: CallStateManager,
    private openAIService: OpenAIService,
    private csvService: CsvService
  ) {}

  async processUserInput(callId: string, userInput: string): Promise<string> {
    const state = this.callStateManager.getCall(callId);
    if (!state) {
      logger.error({ callId }, 'Call state not found');
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }

    // Add user input to transcript
    this.callStateManager.addTranscript(callId, 'user', userInput);

    let response: string;

    switch (state.step) {
      case CallStep.GREETING:
        response = await this.handleGreeting(callId);
        break;

      case CallStep.REQUEST_CUSTOMER_NUMBER:
        response = await this.handleCustomerNumber(callId, userInput);
        break;

      case CallStep.REQUEST_METER_NUMBER:
        response = await this.handleMeterNumber(callId, userInput);
        break;

      case CallStep.REQUEST_READING:
        response = await this.handleReading(callId, userInput);
        break;

      case CallStep.CONFIRM_READING:
        response = await this.handleConfirmation(callId);
        break;

      default:
        logger.error({ callId, step: state.step }, 'Unknown call step');
        response = PROMPTS.MAX_RETRIES_EXCEEDED;
    }

    // Add system response to transcript
    this.callStateManager.addTranscript(callId, 'system', response);

    return response;
  }

  private async handleGreeting(callId: string): Promise<string> {
    this.callStateManager.advanceStep(callId, CallStep.REQUEST_CUSTOMER_NUMBER);
    return `${PROMPTS.GREETING} ${PROMPTS.REQUEST_CUSTOMER_NUMBER}`;
  }

  private async handleCustomerNumber(callId: string, userInput: string): Promise<string> {
    const customerNumber = await this.openAIService.extractNumber(
      userInput,
      'Kundennummer',
      callId
    );

    if (!customerNumber) {
      return this.handleUnclearInput(callId, PROMPTS.REQUEST_CUSTOMER_NUMBER);
    }

    // Validate customer exists
    const customer = await this.csvService.findCustomerByNumber(customerNumber);
    if (!customer) {
      return this.handleUnclearInput(callId, PROMPTS.INVALID_CUSTOMER);
    }

    // Customer valid - save and advance
    this.callStateManager.updateCall(callId, { customerNumber });
    this.callStateManager.advanceStep(callId, CallStep.REQUEST_METER_NUMBER);

    logger.info({ callId, customerNumber }, 'Customer validated');
    return PROMPTS.REQUEST_METER_NUMBER;
  }

  private async handleMeterNumber(callId: string, userInput: string): Promise<string> {
    const state = this.callStateManager.getCall(callId);
    if (!state || !state.customerNumber) {
      logger.error({ callId }, 'Customer number missing in state');
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }

    const meterNumber = await this.openAIService.extractNumber(
      userInput,
      'Zählernummer',
      callId
    );

    if (!meterNumber) {
      return this.handleUnclearInput(callId, PROMPTS.REQUEST_METER_NUMBER);
    }

    // Validate meter belongs to customer
    const isValid = await this.csvService.validateCustomerAndMeter(
      state.customerNumber,
      meterNumber
    );

    if (!isValid) {
      return this.handleUnclearInput(callId, PROMPTS.INVALID_METER);
    }

    // Meter valid - save and advance
    this.callStateManager.updateCall(callId, { meterNumber });
    this.callStateManager.advanceStep(callId, CallStep.REQUEST_READING);

    logger.info({ callId, meterNumber }, 'Meter validated');
    return PROMPTS.REQUEST_READING;
  }

  private async handleReading(callId: string, userInput: string): Promise<string> {
    const state = this.callStateManager.getCall(callId);
    if (!state || !state.customerNumber || !state.meterNumber) {
      logger.error({ callId }, 'Missing customer or meter number in state');
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }

    const readingValue = await this.openAIService.extractNumber(
      userInput,
      'Zählerstand',
      callId
    );

    if (!readingValue) {
      return this.handleUnclearInput(callId, PROMPTS.REQUEST_READING);
    }

    // Save reading
    this.callStateManager.updateCall(callId, { readingValue });

    try {
      const now = new Date();
      await this.csvService.saveMeterReading({
        customer_number: state.customerNumber,
        meter_number: state.meterNumber,
        reading_value: readingValue,
        reading_date: now.toISOString().split('T')[0],
        reading_time: now.toTimeString().split(' ')[0],
        call_id: callId
      });

      this.callStateManager.advanceStep(callId, CallStep.CONFIRM_READING);
      logger.info({ callId, readingValue }, 'Reading saved successfully');

      return PROMPTS.CONFIRMATION;
    } catch (error) {
      logger.error({ callId, error }, 'Failed to save meter reading');
      this.callStateManager.updateCall(callId, { step: CallStep.ERROR });
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }
  }

  private async handleConfirmation(callId: string): Promise<string> {
    this.callStateManager.advanceStep(callId, CallStep.COMPLETED);
    return PROMPTS.CONFIRMATION;
  }

  private handleUnclearInput(callId: string, retryPrompt: string): string {
    const retryCount = this.callStateManager.incrementRetry(callId);

    if (retryCount >= MAX_RETRIES) {
      this.callStateManager.updateCall(callId, { step: CallStep.ERROR });
      logger.warn({ callId, retryCount }, 'Max retries exceeded');
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }

    logger.debug({ callId, retryCount }, 'Retry requested');
    return `${PROMPTS.UNCLEAR_INPUT} ${retryPrompt}`;
  }
}
