import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './utils/logger';
import { generateCorrelationId } from './utils/correlationId';
import { CallStateManager } from './services/CallStateManager';
import { OpenAIService } from './services/OpenAIService';
import { CsvService } from './services/CsvService';
import { CallFlowService } from './services/CallFlowService';
import { createTeniosRouter } from './api/tenios.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(pinoHttp({ logger }));

// Initialize services
const callStateManager = new CallStateManager();
const openAIService = new OpenAIService();
const csvService = new CsvService();
const callFlowService = new CallFlowService(
  callStateManager,
  openAIService,
  csvService
);

// Routes
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeCalls: callStateManager.getAllActiveCalls().length
  });
});

// Root route for Tenios direct webhook
app.post('/', async (req, res) => {
  const callId = req.body.callControlUuid || req.body.variables?.call_uuid || generateCorrelationId();
  const userInput = req.body.variables?.collected_user_input;
  const isInitialCall = !userInput && req.body.loopCount === 0;

  logger.info({ callId, body: req.body, userInput, isInitialCall }, 'Tenios webhook received');

  try {
    // Get or create call state
    let state = callStateManager.getCall(callId);
    if (!state) {
      callStateManager.createCall(callId);
      state = callStateManager.getCall(callId);
    }

    // Process user input (empty string for initial call)
    const systemResponse = await callFlowService.processUserInput(callId, userInput || '');

    // Check if call is complete
    const updatedState = callStateManager.getCall(callId);
    const { CallStep } = await import('./models/CallState');

    if (
      updatedState?.step === CallStep.COMPLETED ||
      updatedState?.step === CallStep.ERROR
    ) {
      // End call
      callStateManager.deleteCall(callId);

      return res.json({
        blocks: [
          {
            blockType: 'SAY',
            text: systemResponse,
            voiceName: 'de.female.2',
            useSsml: false
          },
          {
            blockType: 'HANGUP',
            hangupCause: 'NORMAL_UNSPECIFIED'
          }
        ]
      });
    }

    // Continue conversation with SAY + COLLECT_SPEECH
    const response = {
      blocks: [
        {
          blockType: 'SAY',
          text: systemResponse,
          voiceName: 'de.female.2',
          useSsml: true
        },
        {
          blockType: 'COLLECT_SPEECH',
          asrProvider: 'GOOGLE',
          language: 'de-DE',
          variableName: 'user_input',
          maxTries: 2,
          timeout: 10
        }
      ]
    };

    logger.info({ response }, 'Sending response to Tenios');
    res.json(response);
  } catch (error) {
    logger.error({ callId, error }, 'Error handling call');
    res.status(500).json({
      blocks: [
        {
          blockType: 'HANGUP',
          hangupCause: 'NORMAL_UNSPECIFIED'
        }
      ]
    });
  }
});

// Response webhook for user input
app.post('/response', async (req, res) => {
  const callId = req.body.callControlUuid || req.body.variables?.call_uuid;
  const userInput = req.body.variables?.collected_user_input;

  logger.info({ callId, body: req.body, userInput }, 'User response received');

  try {
    const state = callStateManager.getCall(callId);
    if (!state) {
      logger.error({ callId }, 'Call state not found');
      return res.json({
        blocks: [{
          blockType: 'HANGUP',
          hangupCause: 'NORMAL_UNSPECIFIED'
        }]
      });
    }

    // Process user input through call flow
    const systemResponse = await callFlowService.processUserInput(callId, userInput || '');

    // Check if call is complete
    const updatedState = callStateManager.getCall(callId);
    const { CallStep } = await import('./models/CallState');

    if (
      updatedState?.step === CallStep.COMPLETED ||
      updatedState?.step === CallStep.ERROR
    ) {
      // End call
      callStateManager.deleteCall(callId);

      return res.json({
        blocks: [
          {
            blockType: 'SAY',
            text: systemResponse,
            voiceName: 'de.female.2',
            useSsml: false
          },
          {
            blockType: 'HANGUP',
            hangupCause: 'NORMAL_UNSPECIFIED'
          }
        ]
      });
    }

    // Continue conversation
    return res.json({
      blocks: [
        {
          blockType: 'SAY',
          text: systemResponse,
          voiceName: 'de.female.2',
          useSsml: true
        },
        {
          blockType: 'COLLECT_SPEECH',
          asrProvider: 'GOOGLE',
          language: 'de-DE',
          variableName: 'user_input',
          maxTries: 2,
          timeout: 10
        }
      ]
    });
  } catch (error) {
    logger.error({ callId, error }, 'Error processing user response');
    return res.json({
      blocks: [{
        blockType: 'HANGUP',
        hangupCause: 'NORMAL_UNSPECIFIED'
      }]
    });
  }
});

// Tenios webhooks (alternative access)
const teniosRouter = createTeniosRouter(callStateManager, openAIService, callFlowService, csvService);
app.use('/api/tenios', teniosRouter);

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      maxConcurrentCalls: env.MAX_CONCURRENT_CALLS
    },
    'Server started successfully'
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
