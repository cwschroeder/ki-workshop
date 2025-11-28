/**
 * TENIOS Webhook Routes
 *
 * Handles incoming webhooks from TENIOS:
 * - Call Control API (main webhook)
 * - Call HTTPS-Posts API (call events like CALL_END)
 *
 * Documentation:
 * - https://www.tenios.de/doc/external-call-control-api
 * - https://www.tenios.de/doc/api-call-posts
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
          // Check if this is a duplicate input (TENIOS sends same input in consecutive loops)
          const lastInput = session.metadata.lastUserInput;
          const isDuplicate = lastInput === userInput;

          if (isDuplicate) {
            console.log(`[Webhook] Skipping duplicate input: "${userInput}"`);
          } else {
            // Store this input to detect future duplicates
            session.metadata.lastUserInput = userInput;
            await voiceService.processUserInput(session.sessionId, userInput);

            // Emit user input to WebSocket client
            wsHandler.emitToSession(session.sessionId, 'call.user_input', {
              callId,
              input: userInput
            });
          }
        }

        // Wait for client to send actions (max 500ms)
        await new Promise(resolve => setTimeout(resolve, 500));

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

  /**
   * Call HTTPS-Posts webhook endpoint
   *
   * Receives call events from TENIOS:
   * - BLOCK_END: After each call block completes
   * - CALL_END: When call ends (hangup, busy, etc.)
   * - INITIATE_FORWARD: When call forwarding is initiated
   * - FORWARD_ANSWER: When forwarded call is answered
   *
   * Configure this URL in TENIOS portal under routing settings.
   * URL: https://your-server.com/webhook/call-post
   *
   * Documentation: https://www.tenios.de/doc/api-call-posts
   */
  router.post('/webhook/call-post', async (req: Request, res: Response) => {
    try {
      // DEBUG: Log complete request body
      console.log('[CallPost] Raw request body:', JSON.stringify(req.body, null, 2));

      // Parse the call post data
      const postData = telephonyProvider.parseCallPost(req.body);

      console.log(`[CallPost] Parsed event:`, {
        type: postData.type,
        callUuid: postData.callUuid,
        destinationNumber: postData.destinationNumber,
        duration: postData.duration,
        hangupCause: postData.hangupCause,
        recordingUuid: postData.recordingUuid
      });

      // Find the session by phone number
      const phoneNumber = postData.destinationNumber || '';
      const session = sessionManager.getSessionByPhone(phoneNumber);

      if (session) {
        console.log(`[CallPost] Found session ${session.sessionId} for phone ${phoneNumber}`);

        // Handle different event types
        switch (postData.type) {
          case 'CALL_START':
            // Emit call started event (informational)
            wsHandler.emitToSession(session.sessionId, 'call.started', {
              callUuid: postData.callUuid,
              callerNumber: postData.callerNumber,
              destinationNumber: postData.destinationNumber
            });
            console.log(`[CallPost] Emitted call.started to session ${session.sessionId}`);
            break;

          case 'CALL_END':
            // Emit call ended event to WebSocket client
            wsHandler.emitToSession(session.sessionId, 'call.ended', {
              callUuid: postData.callUuid,
              duration: postData.duration,
              hangupCause: postData.hangupCause,
              recordingUuid: postData.recordingUuid,
              callStart: postData.callStart,
              callEnd: postData.callEnd
            });

            // Also emit generic event for recording availability
            if (postData.recordingUuid) {
              wsHandler.emitToSession(session.sessionId, 'recording.available', {
                callUuid: postData.callUuid,
                recordingUuid: postData.recordingUuid
              });
            }

            console.log(`[CallPost] Emitted call.ended to session ${session.sessionId}`);
            break;

          case 'BLOCK_END':
            // Emit block end event (useful for tracking call flow progress)
            wsHandler.emitToSession(session.sessionId, 'call.block_end', {
              callUuid: postData.callUuid,
              variables: postData.variables
            });
            break;

          case 'INITIATE_FORWARD':
            wsHandler.emitToSession(session.sessionId, 'call.forward_initiated', {
              callUuid: postData.callUuid
            });
            break;

          case 'FORWARD_ANSWER':
            wsHandler.emitToSession(session.sessionId, 'call.forward_answered', {
              callUuid: postData.callUuid
            });
            break;

          default:
            console.log(`[CallPost] Unhandled event type: ${postData.type}`);
        }
      } else {
        console.log(`[CallPost] No session found for phone ${phoneNumber}`);
      }

      // Always respond with 200 OK to acknowledge receipt
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('[CallPost] Error processing call post:', error);
      // Still respond 200 to prevent TENIOS retries
      res.status(200).json({ status: 'error', message: 'Internal error' });
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

    case 'bridge':
      blocks.push(await voiceService.bridge(sessionId, action.destination, action));
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

    case 'play_announcement':
      blocks.push(await voiceService.playAnnouncement(sessionId, action.announcementName));
      break;

    default:
      console.warn(`[Webhook] Unknown action type: ${action.type}`);
      blocks.push(await voiceService.say(sessionId, 'Unbekannte Aktion.'));
      blocks.push(await voiceService.hangup(sessionId));
  }

  return blocks;
}
