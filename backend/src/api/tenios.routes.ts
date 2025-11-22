import { Router, Request, Response } from 'express';
import { CallStateManager } from '../services/CallStateManager';
import { OpenAIService } from '../services/OpenAIService';
import { CallFlowService } from '../services/CallFlowService';
import { CsvService } from '../services/CsvService';
import { CallStep } from '../models/CallState';
import { createLogger } from '../utils/logger';
import { generateCorrelationId } from '../utils/correlationId';

const logger = createLogger({ service: 'TeniosRoutes' });

export function createTeniosRouter(
  callStateManager: CallStateManager,
  openAIService: OpenAIService,
  callFlowService: CallFlowService,
  _csvService: CsvService
): Router {
  const router = Router();

  /**
   * Webhook endpoint for incoming calls
   * Tenios calls this when a new call arrives
   */
  router.post('/webhook/incoming', async (req: Request, res: Response) => {
    const correlationId = generateCorrelationId();
    const callId = req.body.callId || correlationId;

    logger.info({ callId, body: req.body }, 'Incoming call webhook received');

    try {
      // Create new call state
      callStateManager.createCall(callId);

      // Start with greeting
      const greeting = await callFlowService.processUserInput(callId, '');

      // Generate TTS audio
      const audioBuffer = await openAIService.synthesizeSpeech(greeting, callId);

      // Return Tenios Call Control response
      // Documentation: https://www.tenios.de/doc-category/voice-api-allgemein
      res.json({
        action: 'play_and_collect',
        audioUrl: `data:audio/mp3;base64,${audioBuffer.toString('base64')}`,
        timeout: 5000,
        maxDigits: 0,
        finishOnKey: '#',
        next: {
          url: `${req.protocol}://${req.get('host')}/api/tenios/webhook/response`,
          method: 'POST'
        }
      });
    } catch (error) {
      logger.error({ callId, error }, 'Error handling incoming call');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Webhook endpoint for user responses
   * Tenios calls this after collecting user input
   */
  router.post('/webhook/response', async (req: Request, res: Response) => {
    const callId = req.body.callId;
    const userAudioUrl = req.body.recordingUrl;

    logger.info({ callId, body: req.body }, 'User response webhook received');

    try {
      const state = callStateManager.getCall(callId);
      if (!state) {
        logger.error({ callId }, 'Call state not found');
        return res.json({
          action: 'hangup'
        });
      }

      // Download user audio from Tenios
      const audioResponse = await fetch(userAudioUrl);
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      // Transcribe user input
      const userInput = await openAIService.transcribeAudio(audioBuffer, callId);

      // Process user input through call flow
      const systemResponse = await callFlowService.processUserInput(callId, userInput);

      // Check if call is complete
      const updatedState = callStateManager.getCall(callId);
      if (
        updatedState?.step === CallStep.COMPLETED ||
        updatedState?.step === CallStep.ERROR
      ) {
        // End call
        const finalAudio = await openAIService.synthesizeSpeech(systemResponse, callId);

        callStateManager.deleteCall(callId);

        return res.json({
          action: 'play_and_hangup',
          audioUrl: `data:audio/mp3;base64,${finalAudio.toString('base64')}`
        });
      }

      // Continue conversation
      const responseAudio = await openAIService.synthesizeSpeech(systemResponse, callId);

      return res.json({
        action: 'play_and_collect',
        audioUrl: `data:audio/mp3;base64,${responseAudio.toString('base64')}`,
        timeout: 5000,
        maxDigits: 0,
        finishOnKey: '#',
        next: {
          url: `${req.protocol}://${req.get('host')}/api/tenios/webhook/response`,
          method: 'POST'
        }
      });
    } catch (error) {
      logger.error({ callId, error }, 'Error processing user response');
      return res.status(500).json({ action: 'hangup' });
    }
  });

  /**
   * Webhook endpoint for call completion
   */
  router.post('/webhook/completed', async (req: Request, res: Response) => {
    const callId = req.body.callId;

    logger.info({ callId, body: req.body }, 'Call completed webhook received');

    callStateManager.deleteCall(callId);

    res.json({ status: 'ok' });
  });

  return router;
}
