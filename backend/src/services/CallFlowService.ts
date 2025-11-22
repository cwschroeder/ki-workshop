import { CallStateManager } from './CallStateManager';
import { OpenAIService } from './OpenAIService';
import { CsvService } from './CsvService';
import { AIAgentService } from './AIAgentService';
import { CallStep } from '../models/CallState';
import { PROMPTS, MAX_RETRIES } from '../config/constants';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'CallFlowService' });

export class CallFlowService {
  private aiAgentService: AIAgentService;

  constructor(
    private callStateManager: CallStateManager,
    private openAIService: OpenAIService,
    private csvService: CsvService
  ) {
    this.aiAgentService = new AIAgentService();
  }

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

      case CallStep.MENU_SELECTION:
        response = await this.handleMenuSelection(callId, userInput);
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

      case CallStep.AI_AGENT:
        response = await this.handleAIAgent(callId);
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
    this.callStateManager.advanceStep(callId, CallStep.MENU_SELECTION);
    return `${PROMPTS.GREETING} ${PROMPTS.MENU_SELECTION}`;
  }

  private async handleMenuSelection(callId: string, userInput: string): Promise<string> {
    // Try to extract menu choice (1 or 2)
    const menuChoice = await this.openAIService.extractNumber(
      userInput,
      'Menüauswahl (1 für Zählerstand, 2 für Mitarbeiter)',
      callId
    );

    // Also check for keywords in user input
    const lowerInput = userInput.toLowerCase();
    const wantsMeterReading = lowerInput.includes('zählerstand') || lowerInput.includes('zähler') ||
                               lowerInput.includes('eins') || menuChoice === '1';
    const wantsAgent = lowerInput.includes('mitarbeiter') || lowerInput.includes('agent') ||
                       lowerInput.includes('zwei') || menuChoice === '2';

    if (wantsMeterReading) {
      // User wants to report meter reading - continue with normal flow
      logger.info({ callId }, 'User selected meter reading from menu');
      this.callStateManager.advanceStep(callId, CallStep.REQUEST_CUSTOMER_NUMBER);
      return PROMPTS.REQUEST_CUSTOMER_NUMBER;
    } else if (wantsAgent) {
      // User wants to talk to an agent - will be handled in index.ts via BRIDGE block
      logger.info({ callId }, 'User selected agent transfer from menu');
      this.callStateManager.advanceStep(callId, CallStep.TRANSFERRED_TO_AGENT);
      // This special response will be detected in index.ts to trigger BRIDGE + Silent Monitoring
      return 'TRANSFER_TO_AGENT';
    } else {
      // Unclear input - retry menu
      return this.handleUnclearInput(callId, PROMPTS.MENU_SELECTION);
    }
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

  private async handleAIAgent(callId: string): Promise<string> {
    const state = this.callStateManager.getCall(callId);
    if (!state) {
      logger.error({ callId }, 'Call state not found for AI agent');
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }

    try {
      // Generate AI agent response based on conversation history
      const { response, shouldEnd } = await this.aiAgentService.generateAgentResponse(
        state.transcript,
        callId
      );

      if (shouldEnd) {
        // AI agent wants to end the conversation
        logger.info({ callId }, 'AI agent ending conversation');
        this.callStateManager.advanceStep(callId, CallStep.COMPLETED);
      }

      return `<prosody rate="medium">${response}</prosody>`;
    } catch (error) {
      logger.error({ callId, error }, 'Error in AI agent conversation');
      this.callStateManager.updateCall(callId, { step: CallStep.ERROR });
      return PROMPTS.MAX_RETRIES_EXCEEDED;
    }
  }
}
