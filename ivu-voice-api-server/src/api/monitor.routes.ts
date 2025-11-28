import { Router, Request, Response } from 'express';
import { getMonitorService } from '../services/MonitorService';
import { env } from '../config/env';

const router = Router();

/**
 * GET /api/monitor/status
 * Get monitor service status
 */
router.get('/status', (req: Request, res: Response) => {
  const service = getMonitorService();

  res.json({
    enabled: env.SIP_ENABLED,
    running: service.isRunning(),
    config: {
      port: env.SIP_PORT,
      domain: env.SIP_DOMAIN,
      username: env.SIP_USERNAME || '(not configured)'
    },
    activeSessions: service.getActiveSessions().length
  });
});

/**
 * GET /api/monitor/sessions
 * List active monitoring sessions
 */
router.get('/sessions', (req: Request, res: Response) => {
  const service = getMonitorService();
  const sessions = service.getActiveSessions();

  res.json({
    count: sessions.length,
    sessions: sessions.map((session) => ({
      callId: session.callId,
      agentId: session.agentId,
      startedAt: session.startedAt.toISOString(),
      durationMs: session.durationMs,
      durationFormatted: formatDuration(session.durationMs),
      transcriptCount: session.transcriptCount
    }))
  });
});

/**
 * GET /api/monitor/sessions/:callId
 * Get details for a specific session
 */
router.get('/sessions/:callId', (req: Request, res: Response) => {
  const { callId } = req.params;
  const service = getMonitorService();

  const sessions = service.getActiveSessions();
  const session = sessions.find((s) => s.callId === callId);

  if (!session) {
    res.status(404).json({ error: `Session ${callId} not found` });
    return;
  }

  const transcripts = service.getSessionTranscripts(callId);

  res.json({
    callId: session.callId,
    agentId: session.agentId,
    startedAt: session.startedAt.toISOString(),
    durationMs: session.durationMs,
    durationFormatted: formatDuration(session.durationMs),
    transcriptCount: session.transcriptCount,
    transcripts: transcripts?.map((t) => ({
      text: t.text,
      timestamp: t.timestamp.toISOString(),
      durationMs: t.durationMs
    }))
  });
});

/**
 * GET /api/monitor/sessions/:callId/transcript
 * Get full transcript text for a session
 */
router.get('/sessions/:callId/transcript', (req: Request, res: Response) => {
  const { callId } = req.params;
  const { format } = req.query;
  const service = getMonitorService();

  const transcripts = service.getSessionTranscripts(callId);

  if (!transcripts) {
    res.status(404).json({ error: `Session ${callId} not found` });
    return;
  }

  if (format === 'text') {
    // Plain text format
    res.type('text/plain');
    res.send(transcripts.map((t) => t.text).join('\n'));
  } else if (format === 'srt') {
    // SRT subtitle format
    res.type('text/plain');
    res.send(
      transcripts
        .map((t, i) => {
          const startMs = t.timestamp.getTime() - transcripts[0].timestamp.getTime();
          const endMs = startMs + (t.durationMs || 3000);
          return `${i + 1}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${t.text}\n`;
        })
        .join('\n')
    );
  } else {
    // JSON format (default)
    res.json({
      callId,
      transcriptCount: transcripts.length,
      fullText: transcripts.map((t) => t.text).join(' '),
      entries: transcripts.map((t) => ({
        text: t.text,
        timestamp: t.timestamp.toISOString(),
        durationMs: t.durationMs
      }))
    });
  }
});

/**
 * DELETE /api/monitor/sessions/:callId
 * Terminate a specific monitoring session
 */
router.delete('/sessions/:callId', async (req: Request, res: Response) => {
  const { callId } = req.params;
  const service = getMonitorService();

  const terminated = await service.terminateSession(callId);

  if (terminated) {
    res.json({ success: true, message: `Session ${callId} terminated` });
  } else {
    res.status(404).json({ success: false, error: `Session ${callId} not found` });
  }
});

/**
 * GET /api/monitor/providers
 * List available providers (STT and Denoiser)
 */
router.get('/providers', (req: Request, res: Response) => {
  const service = getMonitorService();
  const providers = service.getAvailableProviders();
  const currentDefaults = service.getDefaultOptions();

  res.json({
    stt: providers.stt,
    denoiser: providers.denoiser,
    defaults: {
      stt: currentDefaults.sttProvider || env.DEFAULT_STT_PROVIDER,
      denoiser: currentDefaults.denoiserProvider || env.DEFAULT_DENOISER_PROVIDER
    }
  });
});

/**
 * POST /api/monitor/config
 * Update default configuration
 */
router.post('/config', (req: Request, res: Response) => {
  const { sttProvider, language, denoiserProvider } = req.body;
  const service = getMonitorService();

  const providers = service.getAvailableProviders();

  // Validate STT provider
  if (sttProvider && !providers.stt.includes(sttProvider)) {
    res.status(400).json({
      error: `Invalid STT provider: ${sttProvider}`,
      available: providers.stt
    });
    return;
  }

  // Validate Denoiser provider
  if (denoiserProvider && !providers.denoiser.includes(denoiserProvider)) {
    res.status(400).json({
      error: `Invalid Denoiser provider: ${denoiserProvider}`,
      available: providers.denoiser
    });
    return;
  }

  service.setDefaultOptions({
    sttProvider,
    language,
    denoiserProvider
  });

  res.json({
    success: true,
    message: 'Configuration updated',
    config: {
      sttProvider: sttProvider || env.DEFAULT_STT_PROVIDER,
      language: language || 'de',
      denoiserProvider: denoiserProvider || env.DEFAULT_DENOISER_PROVIDER
    }
  });
});

/**
 * POST /api/monitor/start
 * Start the monitor service
 */
router.post('/start', async (req: Request, res: Response) => {
  if (!env.SIP_ENABLED) {
    res.status(400).json({
      error: 'SIP is disabled in environment configuration',
      hint: 'Set SIP_ENABLED=true in your .env file'
    });
    return;
  }

  const service = getMonitorService();

  if (service.isRunning()) {
    res.json({ success: true, message: 'Monitor service already running' });
    return;
  }

  try {
    await service.start();
    res.json({ success: true, message: 'Monitor service started' });
  } catch (error) {
    console.error('[Monitor API] Failed to start service:', error);
    res.status(500).json({
      error: 'Failed to start monitor service',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/monitor/stop
 * Stop the monitor service
 */
router.post('/stop', async (req: Request, res: Response) => {
  const service = getMonitorService();

  if (!service.isRunning()) {
    res.json({ success: true, message: 'Monitor service not running' });
    return;
  }

  try {
    await service.stop();
    res.json({ success: true, message: 'Monitor service stopped' });
  } catch (error) {
    console.error('[Monitor API] Failed to stop service:', error);
    res.status(500).json({
      error: 'Failed to stop monitor service',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Helper functions

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function pad(num: number, size: number = 2): string {
  return num.toString().padStart(size, '0');
}

export default router;
