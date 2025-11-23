/**
 * TENIOS Webhook Routes
 *
 * Handles incoming webhooks from TENIOS Call Control API.
 * Routes calls to appropriate workshop sessions via phone number mapping.
 */

import { Router, Request, Response } from 'express';
import type { SessionManager } from '../services/SessionManager';
import type { IVUVoiceService } from '../services/IVUVoiceService';
import type { ITelephonyProvider } from '../providers/telephony/ITelephonyProvider';
import type { VoiceWebSocketHandler } from '../websocket/VoiceWebSocketHandler';

export function createWebhookRouter(
  sessionManager: SessionManager,
  voiceService: IVUVoiceService,
  telephonyProvider: ITelephonyProvider,
  wsHandler: VoiceWebSocketHandler
): Router {
  const router = Router();

  /**
   * Main webhook endpoint for TENIOS Call Control API
   * Documentation: https://www.tenios.de/doc/external-call-control-api
   */
  router.post('/webhook', async (req: Request, res: Response) => {
    try {
      // DEBUG: Log complete request body
      console.log('[Webhook] Raw request body:', JSON.stringify(req.body, null, 2));

      // Parse incoming call data from TENIOS
      const callData = telephonyProvider.parseIncomingCall(req.body);
      const { callId, loopCount, userInput, to } = callData;

      console.log(`[Webhook] Parsed call data:`, {
        callId,
        to,
        loopCount,
        hasUserInput: !!userInput
      });

      // Determine which session this call belongs to based on called number
      const phoneNumber = to || '';
      const session = sessionManager.getSessionByPhone(phoneNumber);

      if (!session) {
        console.warn(`[Webhook] No session found for phone ${phoneNumber}`);

        // Return default response: inform caller and hangup
        const blocks = [
          telephonyProvider.say('Diese Nummer ist aktuell keiner Workshop-Session zugeordnet.'),
          telephonyProvider.hangup()
        ];

        return res.json(telephonyProvider.createResponse(blocks));
      }

      console.log(`[Webhook] Routed to session ${session.sessionId}`);

      // Check if this is initial call or follow-up
      const isInitialCall = loopCount === 0 && !userInput;

      if (isInitialCall) {
        // New call - register it first
        sessionManager.registerCall(session.sessionId, callId);

        // Emit to client via WebSocket and wait for actions
        wsHandler.emitCallIncoming(phoneNumber, callId, callData);

        // Wait a short time for client to send actions (max 500ms)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if client has sent actions (use queue)
        const pendingActions = session.metadata.pendingActions || [];

        if (pendingActions.length > 0) {
          // Client responded with actions - execute all of them
          console.log(`[Webhook] Executing ${pendingActions.length} pending actions`);

          const blocks = [];
          for (const action of pendingActions) {
            const actionBlocks = await executeAction(
              session.sessionId,
              action,
              voiceService
            );
            blocks.push(...actionBlocks);
          }

          // Clear action queue
          session.metadata.pendingActions = [];

          return res.json(voiceService.createResponse(blocks));
        } else {
          // No action ready - send default greeting and wait
          const blocks = [
            telephonyProvider.say('Einen Moment bitte, Verbindung wird hergestellt.'),
            telephonyProvider.collectSpeech({
              language: 'de-DE',
              timeout: 30
            })
          ];

          return res.json(voiceService.createResponse(blocks));
        }
      } else {
        // Follow-up: User provided input
        if (userInput) {
          await voiceService.processUserInput(session.sessionId, userInput);
        }

        // Check for pending actions from client (use queue)
        const pendingActions = session.metadata.pendingActions || [];

        if (pendingActions.length > 0) {
          console.log(`[Webhook] Executing ${pendingActions.length} pending actions`);

          const blocks = [];
          for (const action of pendingActions) {
            const actionBlocks = await executeAction(
              session.sessionId,
              action,
              voiceService
            );
            blocks.push(...actionBlocks);
          }

          // Clear action queue
          session.metadata.pendingActions = [];

          return res.json(voiceService.createResponse(blocks));
        } else {
          // No action - keep collecting input
          const blocks = [
            telephonyProvider.collectSpeech({
              language: 'de-DE',
              timeout: 30
            })
          ];

          return res.json(voiceService.createResponse(blocks));
        }
      }
    } catch (error) {
      console.error('[Webhook] Error processing webhook:', error);

      // Return error response
      const blocks = [
        telephonyProvider.say('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.'),
        telephonyProvider.hangup()
      ];

      return res.status(500).json(telephonyProvider.createResponse(blocks));
    }
  });

  return router;
}

/**
 * Execute a call action from client
 */
async function executeAction(
  sessionId: string,
  action: any,
  voiceService: IVUVoiceService
): Promise<any[]> {
  const blocks: any[] = [];

  switch (action.type) {
    case 'say':
      blocks.push(await voiceService.say(sessionId, action.text, action));
      break;

    case 'collect_speech':
      blocks.push(await voiceService.collectSpeech(sessionId, action));
      break;

    case 'collect_digits':
      blocks.push(await voiceService.collectDigits(sessionId, action));
      break;

    case 'transfer':
      blocks.push(await voiceService.transfer(sessionId, action.destination, action));
      break;

    case 'hangup':
      // If there's a goodbye message, say it first
      if (action.message) {
        blocks.push(await voiceService.say(sessionId, action.message));
      }
      blocks.push(await voiceService.hangup(sessionId));
      break;

    default:
      console.warn(`[Webhook] Unknown action type: ${action.type}`);
      blocks.push(await voiceService.say(sessionId, 'Unbekannte Aktion.'));
      blocks.push(await voiceService.hangup(sessionId));
  }

  return blocks;
}
