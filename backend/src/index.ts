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
import { AudioCacheService } from './services/AudioCacheService';
import { voiceAgentService } from './services/VoiceAgentService';
import { createTeniosRouter } from './api/tenios.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(pinoHttp({
  logger,
  autoLogging: false // Disable automatic request logging
}));

// Initialize services
const callStateManager = new CallStateManager();
const openAIService = new OpenAIService();
const csvService = new CsvService();
const audioCacheService = new AudioCacheService();
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

// Audio hosting endpoint
app.get('/audio/:audioId', (req, res) => {
  const { audioId } = req.params;
  const audio = audioCacheService.get(audioId);

  if (!audio) {
    res.status(404).send('Audio not found');
    return;
  }

  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Length', audio.length.toString());
  res.send(audio);
});

// Root route for Tenios direct webhook
app.post('/', async (req, res) => {
  const callId = req.body.callControlUuid || req.body.variables?.call_uuid || generateCorrelationId();
  const userInput = req.body.variables?.collected_user_input;
  const isInitialCall = !userInput && req.body.loopCount === 0;

  // Log full body if userInput is empty to debug ASR issue
  if (!userInput && !isInitialCall) {
    logger.warn({ callId, fullBody: req.body }, 'No user input received from Tenios');
  }

  logger.info({
    callId,
    loopCount: req.body.loopCount,
    userInput,
    isInitialCall,
    status: req.body.requestStatus,
    errors: req.body.blocksProcessingResult?.validationErrors
  }, 'Tenios webhook');

  try {
    if (env.FORCE_AGENT_BRIDGE) {
      // Silent monitoring disabled until SUPERVISOR_KEY is configured
      // const callUuid = req.body.variables?.call_uuid;
      // if (callUuid && env.SUPERVISOR_KEY !== 'XXXXX-XXXX-XXXXXX') {
      //   teniosService.startSilentMonitoring(
      //     callUuid,
      //     env.TRANSCRIPTION_SIP_URI,
      //     env.SUPERVISOR_KEY
      //   ).catch((error) => {
      //     logger.error({ callId, error }, 'Failed to start silent monitoring (forced bridge)');
      //   });
      // }

      res.json({
        blocks: [
          {
            blockType: 'SAY',
            text: '<prosody rate="medium">Vielen Dank, Sie werden sofort mit einem Mitarbeiter verbunden.</prosody>',
            voiceName: 'de.female.2',
            useSsml: true
          },
          {
            blockType: 'BRIDGE',
            bridgeMode: 'SEQUENTIAL',
            destinations: [
              {
                destination: env.AGENT_SIP_URI,
                destinationType: 'SIP_USER',
                timeout: 30
              }
            ]
          }
        ]
      });
      return;
    }

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

    // Check for agent transfer request
    if (systemResponse === 'TRANSFER_TO_AGENT') {
      // Check if we should simulate human agent with AI
      if (env.SIMULATE_HUMAN_AGENT) {
        // DEV Mode: Use AI agent instead of real human
        logger.info({ callId }, 'Starting AI agent simulation (DEV mode)');
        callStateManager.advanceStep(callId, CallStep.AI_AGENT);

        res.json({
          blocks: [
            {
              blockType: 'SAY',
              text: '<prosody rate="medium">Einen Moment bitte, ich verbinde Sie mit einem Mitarbeiter.</prosody>',
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
        return;
      } else {
        // PROD Mode: Transfer to real human agent
        // Silent monitoring disabled until SUPERVISOR_KEY is configured
        // const callUuid = req.body.variables?.call_uuid;
        // if (callUuid && env.SUPERVISOR_KEY !== 'XXXXX-XXXX-XXXXXX') {
        //   logger.info({ callId, callUuid }, 'Starting agent transfer with silent monitoring');
        //   teniosService.startSilentMonitoring(
        //     callUuid,
        //     env.TRANSCRIPTION_SIP_URI,
        //     env.SUPERVISOR_KEY
        //   ).catch((error) => {
        //     logger.error({ callId, error }, 'Failed to start silent monitoring');
        //   });
        // }

        // Return BRIDGE block to transfer to agent
        res.json({
          blocks: [
            {
              blockType: 'SAY',
              text: '<prosody rate="medium">Einen Moment bitte, ich verbinde Sie mit einem Mitarbeiter.</prosody>',
              voiceName: 'de.female.2',
              useSsml: true
            },
            {
              blockType: 'BRIDGE',
              bridgeMode: 'SEQUENTIAL',
              destinations: [
                {
                  destination: env.AGENT_SIP_URI,
                  destinationType: 'SIP_USER',
                  timeout: 30
                }
              ]
            }
          ]
        });
        return;
      }
    }

    if (
      updatedState?.step === CallStep.COMPLETED ||
      updatedState?.step === CallStep.ERROR
    ) {
      // End call
      callStateManager.deleteCall(callId);

      res.json({
        blocks: [
          {
            blockType: 'SAY',
            text: systemResponse,
            voiceName: 'de.female.2',
            useSsml: true
          },
          {
            blockType: 'HANGUP',
            hangupCause: 'NORMAL_UNSPECIFIED'
          }
        ]
      });
      return;
    }

    const sayBlock = {
      blockType: 'SAY',
      text: systemResponse,
      voiceName: 'de.female.2',
      useSsml: true
    };

    const baseCollectSpeech = {
      blockType: 'COLLECT_SPEECH' as const,
      asrProvider: 'GOOGLE',
      language: 'de-DE',
      variableName: 'user_input',
      maxTries: 2,
      timeout: 10
    };

    const isMenuSelection = updatedState?.step === CallStep.MENU_SELECTION;

    const collectBlock = isMenuSelection
      ? {
          blockType: 'COLLECT_DIGITS' as const,
          standardAnnouncement: false,
          announcementName: 'Besetzt',
          standardErrorAnnouncement: false,
          errorAnnouncementName: 'Besetzt',
          variableName: 'user_input',
          minDigits: 1,
          maxDigits: 1,
          terminator: '#',
          maxTries: 2,
          timeout: 10,
          allowSpeechInput: true,
          asrProvider: 'GOOGLE',
          language: 'de-DE'
        }
      : { ...baseCollectSpeech };

    const response = {
      blocks: [sayBlock, collectBlock]
    };

    logger.info({
      step: updatedState?.step,
      blocksCount: response.blocks.length,
      tts: sayBlock.voiceName,
      asr: collectBlock.asrProvider
    }, 'Response sent');
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
const server = app.listen(env.PORT, async () => {
  logger.info(
    {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      maxConcurrentCalls: env.MAX_CONCURRENT_CALLS
    },
    'Server started successfully'
  );

  // Start Voice Agent Service
  try {
    await voiceAgentService.start();
    logger.info('Voice Agent Service started');
  } catch (error) {
    logger.error('Failed to start Voice Agent Service:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await voiceAgentService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await voiceAgentService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
