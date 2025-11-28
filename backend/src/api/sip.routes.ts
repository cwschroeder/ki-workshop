import { Router, Request, Response } from 'express';
import { getSIPVoiceService } from '../services/SIPVoiceService';
import { env } from '../config/env';

const router = Router();

/**
 * GET /api/sip/status
 * Get SIP service status
 */
router.get('/status', (req: Request, res: Response) => {
  const service = getSIPVoiceService();

  res.json({
    enabled: env.SIP_ENABLED,
    running: service.isRunning(),
    config: {
      port: env.SIP_PORT,
      domain: env.SIP_DOMAIN,
      username: env.SIP_USERNAME || '(not configured)'
    },
    activeCalls: service.getActiveCalls().length
  });
});

/**
 * GET /api/sip/providers
 * List available providers for voice bot
 */
router.get('/providers', (req: Request, res: Response) => {
  const service = getSIPVoiceService();
  const providers = service.getAvailableProviders();

  res.json({
    providers,
    defaults: {
      stt: env.DEFAULT_STT_PROVIDER,
      tts: env.DEFAULT_TTS_PROVIDER,
      llm: env.DEFAULT_LLM_PROVIDER
    }
  });
});

/**
 * GET /api/sip/calls
 * List active SIP calls
 */
router.get('/calls', (req: Request, res: Response) => {
  const service = getSIPVoiceService();
  const calls = service.getActiveCalls();

  res.json({
    count: calls.length,
    calls: calls.map((call) => ({
      callId: call.callId,
      startedAt: call.startedAt.toISOString(),
      durationMs: Date.now() - call.startedAt.getTime(),
      providers: {
        stt: call.options.sttProvider,
        llm: call.options.llmProvider,
        tts: call.options.ttsProvider
      }
    }))
  });
});

/**
 * DELETE /api/sip/calls/:callId
 * Terminate a specific call
 */
router.delete('/calls/:callId', async (req: Request, res: Response) => {
  const { callId } = req.params;
  const service = getSIPVoiceService();

  const terminated = await service.terminateCall(callId);

  if (terminated) {
    res.json({ success: true, message: `Call ${callId} terminated` });
  } else {
    res.status(404).json({ success: false, error: `Call ${callId} not found` });
  }
});

/**
 * POST /api/sip/config
 * Update default configuration for new calls
 */
router.post('/config', (req: Request, res: Response) => {
  const { systemPrompt, sttProvider, llmProvider, ttsProvider } = req.body;
  const service = getSIPVoiceService();

  const providers = service.getAvailableProviders();

  // Validate providers
  if (sttProvider && !providers.stt.includes(sttProvider)) {
    res.status(400).json({
      error: `Invalid STT provider: ${sttProvider}`,
      available: providers.stt
    });
    return;
  }

  if (llmProvider && !providers.llm.includes(llmProvider)) {
    res.status(400).json({
      error: `Invalid LLM provider: ${llmProvider}`,
      available: providers.llm
    });
    return;
  }

  if (ttsProvider && !providers.tts.includes(ttsProvider)) {
    res.status(400).json({
      error: `Invalid TTS provider: ${ttsProvider}`,
      available: providers.tts
    });
    return;
  }

  service.setDefaultOptions({
    systemPrompt,
    sttProvider,
    llmProvider,
    ttsProvider
  });

  res.json({
    success: true,
    message: 'Configuration updated',
    config: {
      systemPrompt: systemPrompt ? '(custom)' : '(default)',
      sttProvider: sttProvider || env.DEFAULT_STT_PROVIDER,
      llmProvider: llmProvider || env.DEFAULT_LLM_PROVIDER,
      ttsProvider: ttsProvider || env.DEFAULT_TTS_PROVIDER
    }
  });
});

/**
 * POST /api/sip/start
 * Start the SIP service (if not running)
 */
router.post('/start', async (req: Request, res: Response) => {
  if (!env.SIP_ENABLED) {
    res.status(400).json({
      error: 'SIP is disabled in environment configuration',
      hint: 'Set SIP_ENABLED=true in your .env file'
    });
    return;
  }

  const service = getSIPVoiceService();

  if (service.isRunning()) {
    res.json({ success: true, message: 'SIP service already running' });
    return;
  }

  try {
    await service.start();
    res.json({ success: true, message: 'SIP service started' });
  } catch (error) {
    console.error('[SIP API] Failed to start service:', error);
    res.status(500).json({
      error: 'Failed to start SIP service',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/sip/stop
 * Stop the SIP service
 */
router.post('/stop', async (req: Request, res: Response) => {
  const service = getSIPVoiceService();

  if (!service.isRunning()) {
    res.json({ success: true, message: 'SIP service not running' });
    return;
  }

  try {
    await service.stop();
    res.json({ success: true, message: 'SIP service stopped' });
  } catch (error) {
    console.error('[SIP API] Failed to stop service:', error);
    res.status(500).json({
      error: 'Failed to stop SIP service',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
