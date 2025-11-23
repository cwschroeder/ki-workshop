/**
 * Simple B2BUA Test - Audio Bridging Only (No AI)
 *
 * Tests basic B2BUA functionality without OpenAI STT/LLM/TTS to isolate issues
 *
 * Architecture:
 * 1. Customer (port 5062, RTP 14000) → calls B2BUA
 * 2. B2BUA (port 5060, RTP 10000-12000) → bridges to Agent
 * 3. Agent (port 5061, RTP 12000-14000) → receives call
 *
 * Expected: Single stable conference with RTP audio flowing both directions
 */

import { SIPServerService } from '../services/SIPServerService';
import { B2BUAManager } from '../services/B2BUAManager';
import { logger } from '../utils/logger';

class SimpleB2BUATest {
  // B2BUA Server
  private b2buaServer: SIPServerService;
  private b2buaManager: B2BUAManager;

  // Agent Simulator (pjschroeder)
  private agentServer: SIPServerService;

  // Customer Simulator (lkschroeder)
  private customerServer: SIPServerService;

  // Stats
  private rtpPacketsReceived = 0;
  private conferencesCreated = 0;

  async initialize(): Promise<void> {
    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('🧪 Simple B2BUA Test - Audio Bridging Only');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');

    logger.info('🚀 Starting Simple B2BUA Test Environment');

    // 1. Setup B2BUA Server (peer-to-peer mode)
    logger.info('🔧 Setting up B2BUA Server...');
    this.b2buaServer = new SIPServerService(
      5060,
      'b2bua',
      'localhost',
      '',
      undefined,
      true // skipRegistration
    );

    // Set RTP port range for B2BUA
    (this.b2buaServer as any).rtpPortRange = { min: 10000, max: 12000 };
    (this.b2buaServer as any).nextRTPPort = 10000;

    // Create B2BUA Manager
    this.b2buaManager = new B2BUAManager(this.b2buaServer);

    // When B2BUA receives an inbound call, automatically bridge it to the agent
    this.b2buaServer.on('callStarted', async ({ callId }) => {
      // Only bridge inbound calls, not outbound calls we initiate
      const call = (this.b2buaServer as any).activeCalls.get(callId);
      if (!call || call.direction !== 'inbound') {
        return; // Skip outbound calls
      }

      // Check if session already exists for this call
      if (this.b2buaManager.getSessionByInboundCallId(callId)) {
        logger.debug({ callId }, 'Session already exists for this call, skipping');
        return;
      }

      logger.info({ callId }, '📞 INCOMING CALL to B2BUA');

      try {
        const sessionId = await this.b2buaManager.createSession(callId, {
          destinationUri: 'sip:agent@192.168.188.86:5061',
          displayName: 'Test Customer',
          enableTranscription: false
        });

        this.conferencesCreated++;
        logger.info({ sessionId, total: this.conferencesCreated }, '✅ CONFERENCE CREATED');
      } catch (error) {
        logger.error({ error, callId }, 'Failed to create B2BUA session');
      }
    });

    await this.b2buaServer.start();
    logger.info('✅ B2BUA Server started on port 5060');

    // 2. Setup Agent Simulator
    logger.info('🔧 Setting up Agent Simulator (pjschroeder)...');
    this.agentServer = new SIPServerService(
      5061,
      'agent',
      'localhost',
      '',
      undefined,
      true // skipRegistration
    );

    // Set RTP port range for Agent
    (this.agentServer as any).rtpPortRange = { min: 12000, max: 14000 };
    (this.agentServer as any).nextRTPPort = 12000;

    // Agent just logs RTP packets received (no AI processing)
    this.agentServer.on('callStarted', ({ callId, rtpHandler }) => {
      logger.info({ callId }, '📞 AGENT RECEIVED CALL');

      rtpHandler.on('audio', (audioData) => {
        this.rtpPacketsReceived++;
        if (this.rtpPacketsReceived % 50 === 0) {
          logger.info({ packets: this.rtpPacketsReceived, bytes: audioData.length }, '📡 Agent receiving RTP packets');
        }
      });

      // Send silence packets back
      const sendSilence = () => {
        const silencePCM = Buffer.alloc(320); // 20ms of silence (160 samples * 2 bytes)
        rtpHandler.sendAudio(silencePCM);
      };

      // Send silence every 20ms
      const silenceInterval = setInterval(sendSilence, 20);

      // Clean up on call end
      this.agentServer.once('callEnded', () => {
        clearInterval(silenceInterval);
      });
    });

    await this.agentServer.start();
    logger.info('✅ Agent Simulator started on port 5061');

    // 3. Setup Customer Simulator
    logger.info('🔧 Setting up Customer Simulator (lkschroeder)...');
    this.customerServer = new SIPServerService(
      5062,
      'customer',
      'localhost',
      '',
      undefined,
      true // skipRegistration
    );

    // Set RTP port range for Customer
    (this.customerServer as any).rtpPortRange = { min: 14000, max: 16000 };
    (this.customerServer as any).nextRTPPort = 14000;

    // Customer sends silence packets
    this.customerServer.on('callStarted', ({ callId, rtpHandler }) => {
      logger.info({ callId }, '📞 CUSTOMER CALL ESTABLISHED');

      // Send silence packets
      const sendSilence = () => {
        const silencePCM = Buffer.alloc(320); // 20ms of silence
        rtpHandler.sendAudio(silencePCM);
      };

      // Send silence every 20ms
      const silenceInterval = setInterval(sendSilence, 20);

      // Clean up on call end
      this.customerServer.once('callEnded', () => {
        clearInterval(silenceInterval);
      });
    });

    await this.customerServer.start();
    logger.info('✅ Customer Simulator started on port 5062');

    logger.info('✅ Test Environment Ready');
    logger.info('');
    logger.info('📋 Test Setup:');
    logger.info('   1. B2BUA Server: localhost:5060 (RTP 10000-12000)');
    logger.info('   2. Agent Simulator: localhost:5061 (RTP 12000-14000)');
    logger.info('   3. Customer Simulator: localhost:5062 (RTP 14000-16000)');
    logger.info('');
    logger.info('🎬 Test Scenario:');
    logger.info('   - Customer calls B2BUA');
    logger.info('   - B2BUA bridges to Agent');
    logger.info('   - Both sides send/receive silence (no AI)');
    logger.info('   - Should create exactly ONE conference');
    logger.info('');
  }

  async runTest(): Promise<void> {
    logger.info('⏰ Test will start in 3 seconds...');
    logger.info('');
    await new Promise(resolve => setTimeout(resolve, 3000));

    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('🎬 STARTING SIMPLE B2BUA TEST');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');

    // Customer initiates call to B2BUA
    const callId = await this.customerServer.initiateOutboundCall({
      toUri: 'sip:b2bua@192.168.188.86:5060',
      fromDisplayName: 'Test Customer'
    });

    logger.info({ callId }, '📞 Customer initiated call to B2BUA');
    logger.info('');
    logger.info('🔄 Expected flow:');
    logger.info('   1. Customer → B2BUA');
    logger.info('   2. B2BUA bridges to Agent');
    logger.info('   3. Single conference established');
    logger.info('   4. RTP silence packets flow both ways');
    logger.info('');
    logger.info('⏱️  Call will run for 10 seconds...');

    // Let call run for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Hang up
    logger.info('');
    logger.info('⏱️  10 seconds elapsed, hanging up...');
    await this.customerServer.terminateCall(callId);

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Print results
    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('📊 TEST RESULTS');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');
    logger.info({ conferencesCreated: this.conferencesCreated }, '🔗 Total Conferences Created');
    logger.info({ rtpPacketsReceived: this.rtpPacketsReceived }, '📡 Total RTP Packets Received by Agent');
    logger.info('');

    if (this.conferencesCreated === 1) {
      logger.info('✅ SUCCESS: Exactly one conference created (expected)');
    } else {
      logger.error(`❌ FAILED: Expected 1 conference, got ${this.conferencesCreated}`);
    }

    if (this.rtpPacketsReceived > 400) {
      logger.info(`✅ SUCCESS: Received ${this.rtpPacketsReceived} RTP packets (>400 expected for 10s)`);
    } else {
      logger.error(`❌ FAILED: Expected >400 RTP packets, got ${this.rtpPacketsReceived}`);
    }

    logger.info('');
  }

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up...');

    if (this.customerServer) {
      await this.customerServer.stop();
    }

    if (this.agentServer) {
      await this.agentServer.stop();
    }

    if (this.b2buaServer) {
      await this.b2buaServer.stop();
    }

    logger.info('✅ Cleanup complete');
  }
}

// Run the test
async function main() {
  const test = new SimpleB2BUATest();

  try {
    await test.initialize();
    await test.runTest();
  } catch (error) {
    logger.error({ error }, '❌ Test failed with error');
    process.exit(1);
  } finally {
    await test.cleanup();
    process.exit(0);
  }
}

main();
