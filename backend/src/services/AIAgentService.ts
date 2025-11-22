import OpenAI from 'openai';
import { env } from '../config/env';
import { CsvService } from './CsvService';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'AIAgentService' });

export class AIAgentService {
  private client: OpenAI;
  private csvService: CsvService;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
    this.csvService = new CsvService();
  }

  /**
   * Generate AI agent response based on conversation history
   * Uses GPT-4.1-mini for fast, cost-effective responses
   */
  async generateAgentResponse(
    conversationHistory: Array<{ timestamp: string; speaker: 'system' | 'user'; text: string }>,
    callId: string
  ): Promise<{ response: string; shouldEnd: boolean }> {
    try {
      logger.debug({ callId, messageCount: conversationHistory.length }, 'Generating AI agent response');

      // Get customer context if available from conversation
      const customerContext = await this.getCustomerContext(conversationHistory);

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(customerContext);

      // Convert conversation history to OpenAI format
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      // Add conversation history
      for (const entry of conversationHistory) {
        if (entry.speaker === 'user') {
          messages.push({ role: 'user', content: entry.text });
        } else if (entry.speaker === 'system') {
          // Skip initial greeting and menu, start from first agent message
          continue;
        }
      }

      // Generate response
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages,
        temperature: 0.8, // Slightly higher for more natural conversation
        max_tokens: 200
      });

      const response = completion.choices[0]?.message?.content || '';

      // Check if agent wants to end conversation
      const shouldEnd = response.includes('[ENDE]');
      const cleanResponse = response.replace('[ENDE]', '').trim();

      logger.info({ callId, response: cleanResponse, shouldEnd }, 'AI agent response generated');

      return {
        response: cleanResponse,
        shouldEnd
      };
    } catch (error) {
      logger.error({ callId, error }, 'Failed to generate AI agent response');
      return {
        response: 'Entschuldigung, ich habe Sie nicht verstanden. Können Sie das bitte wiederholen?',
        shouldEnd: false
      };
    }
  }

  /**
   * Extract customer context from conversation if customer number mentioned
   */
  private async getCustomerContext(
    conversationHistory: Array<{ timestamp: string; speaker: 'system' | 'user'; text: string }>
  ): Promise<string> {
    try {
      // Look for customer numbers in conversation
      const customers = await this.csvService.getCustomers();

      for (const entry of conversationHistory) {
        if (entry.speaker === 'user') {
          // Check if user mentioned a customer number
          for (const customer of customers) {
            if (entry.text.includes(customer.customer_number)) {
              return `Kunde ${customer.customer_name} (Kundennummer: ${customer.customer_number}, Zählernummer: ${customer.meter_number})`;
            }
          }
        }
      }

      return '';
    } catch (error) {
      logger.error({ error }, 'Failed to get customer context');
      return '';
    }
  }

  /**
   * Build system prompt with optional customer context
   */
  private buildSystemPrompt(customerContext: string): string {
    let prompt = env.AI_AGENT_SYSTEM_PROMPT;

    if (customerContext) {
      prompt += `\n\nAktueller Kundenkontext: ${customerContext}`;
    }

    prompt += `\n\nWichtige Hinweise:
- Sei natürlich und freundlich, wie ein echter Mitarbeiter
- Stelle Rückfragen wenn etwas unklar ist
- Bei Zählerständen: Frage nach Kundennummer, Zählernummer und aktuellem Stand
- Wenn das Gespräch beendet werden soll, antworte mit [ENDE] gefolgt von einer höflichen Verabschiedung
- Halte deine Antworten kurz und präzise (max. 2-3 Sätze)`;

    return prompt;
  }

  /**
   * Save meter reading collected by AI agent
   */
  async saveMeterReading(
    customerNumber: string,
    meterNumber: string,
    readingValue: string,
    callId: string
  ): Promise<boolean> {
    try {
      // Validate customer and meter
      const isValid = await this.csvService.validateCustomerAndMeter(customerNumber, meterNumber);

      if (!isValid) {
        logger.warn({ callId, customerNumber, meterNumber }, 'Invalid customer or meter number');
        return false;
      }

      // Save reading
      const now = new Date();
      await this.csvService.saveMeterReading({
        customer_number: customerNumber,
        meter_number: meterNumber,
        reading_value: readingValue,
        reading_date: now.toISOString().split('T')[0],
        reading_time: now.toTimeString().split(' ')[0],
        call_id: callId
      });

      logger.info({ callId, customerNumber, meterNumber, readingValue }, 'AI agent saved meter reading');
      return true;
    } catch (error) {
      logger.error({ callId, error }, 'Failed to save meter reading');
      return false;
    }
  }
}
