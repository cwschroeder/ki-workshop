/**
 * IVU Voice Client SDK
 *
 * Verbindet sich mit dem IVU Voice API Server und ermöglicht
 * einfache Steuerung von Voice-Calls über WebSocket.
 *
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

export interface VoiceSessionOptions {
  /** URL des IVU Voice API Servers */
  serverUrl?: string;
  /** Optional: User ID für Tracking */
  userId?: string;
  /** Optional: API Key für Authentifizierung */
  apiKey?: string;
}

export interface CallHandle {
  callId: string;
  callUuid?: string;
  sessionId: string;

  /** Text aussprechen (Text-to-Speech) */
  say(text: string): Promise<void>;

  /** Spracheingabe sammeln (ASR) */
  collectSpeech(options?: { prompt?: string; timeout?: number }): Promise<string>;

  /** DTMF-Ziffern sammeln */
  collectDigits(options: { maxDigits: number; prompt?: string }): Promise<string>;

  /** Anruf weiterleiten (Bridge) */
  bridge(destination: string, options?: { destinationType?: string; timeout?: number }): Promise<void>;

  /** Anruf weiterleiten (Legacy) */
  transfer(destination: string): Promise<void>;

  /** Anruf beenden */
  hangup(message?: string): Promise<void>;

  /** Vordefinierte Ansage abspielen */
  playAnnouncement(announcementName: string): Promise<void>;

  /** KI-Konversation führen */
  aiConversation(options: {
    systemPrompt: string;
    maxTurns?: number;
  }): Promise<{ messages: any[]; turnCount: number }>;

  /** Kundeninformationen aus Text extrahieren */
  extractCustomerInfo(text: string): Promise<{
    customerNumber?: string;
    meterNumber?: string;
    reading?: number;
  }>;
}

export class VoiceSession extends EventEmitter {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private serverUrl: string;

  constructor(options: VoiceSessionOptions = {}) {
    super();
    // Standard: IVU-Server (wird im Workshop bereitgestellt)
    this.serverUrl = options.serverUrl || 'wss://mqtt.ivu-software.de:443';
  }

  /** Session starten (verbindet mit IVU-Server) */
  async start(options?: VoiceSessionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`📡 Verbinde mit IVU Voice API: ${this.serverUrl}`);

      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        reconnection: true,
        auth: {
          apiKey: options?.apiKey || process.env.IVU_AI_APIKEY
        }
      });

      this.socket.on('connect', () => {
        console.log('✅ Verbunden mit IVU Voice API');
      });

      this.socket.on('session.created', (data: any) => {
        this.sessionId = data.sessionId;
        console.log(`🎯 Session erstellt: ${this.sessionId}`);
        resolve();
      });

      this.socket.on('call.incoming', (callData: any) => {
        console.log(`📞 Eingehender Anruf: ${callData.callId}`);
        const call = this.createCallHandle(callData);
        this.emit('call.incoming', call);
      });

      this.socket.on('call.user_input', (data: any) => {
        console.log(`💬 Benutzereingabe: ${data.input}`);
        this.emit('call.user_input', data.input);
      });

      this.socket.on('call.ended', (data: any) => {
        console.log(`📵 Anruf beendet: ${data.callId}`);
        this.emit('call.ended', data.callId);
      });

      this.socket.on('error', (error: Error) => {
        console.error('❌ Fehler:', error);
        reject(error);
      });

      setTimeout(() => {
        if (!this.sessionId) reject(new Error('Timeout'));
      }, 10000);
    });
  }

  /** Session beenden */
  stop(): void {
    this.socket?.disconnect();
    this.sessionId = null;
  }

  /** Rufnummer dieser Session zuweisen */
  async assignPhoneNumber(phoneNumber: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('phone.assign', phoneNumber, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else {
          console.log(`📞 Rufnummer zugewiesen: ${phoneNumber}`);
          resolve();
        }
      });
    });
  }

  /** Ausgehenden Anruf tätigen */
  async makeCall(options: {
    destinationNumber: string;
    teniosNumber: string;
    callerId?: string;
  }): Promise<{ callbackId: number }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('call.make', options, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else {
          console.log(`📞 Ausgehender Anruf initiiert: ID ${response.callbackId}`);
          resolve({ callbackId: response.callbackId });
        }
      });
    });
  }

  /** SMS senden */
  async sendSMS(options: {
    from: string;
    to: string;
    text: string;
    tag?: string;
  }): Promise<{ messageUri: string; status: number }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('sms.send', options, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else {
          console.log(`📱 SMS gesendet an: ${options.to}`);
          resolve({ messageUri: response.messageUri, status: response.status });
        }
      });
    });
  }

  /** Anrufaufzeichnung starten */
  async startRecording(options: {
    callUuid: string;
    recordCaller?: boolean;
    recordCallee?: boolean;
  }): Promise<{ recordingUuid: string }> {
    console.log('[CLIENT] startRecording() called with options:', options);

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        console.error('[CLIENT] Socket is null!');
        reject(new Error('Socket not connected'));
        return;
      }

      console.log('[CLIENT] Socket exists:', {
        connected: this.socket.connected,
        id: this.socket.id
      });

      const timeout = setTimeout(() => {
        console.error('[CLIENT] Recording start timeout after 10s');
        reject(new Error('Recording start timeout'));
      }, 10000);

      console.log('[CLIENT] About to emit recording.start event...');
      this.socket.emit('recording.start', options, (response: any) => {
        console.log('[CLIENT] Callback received! Response:', response);
        clearTimeout(timeout);
        if (response.error) reject(new Error(response.error));
        else {
          console.log(`🔴 Aufzeichnung gestartet: ${response.recordingUuid}`);
          resolve({ recordingUuid: response.recordingUuid });
        }
      });
      console.log('[CLIENT] emit() called, waiting for callback...');
    });
  }

  /** Anrufaufzeichnung stoppen */
  async stopRecording(options: {
    callUuid: string;
    recordingUuid: string;
  }): Promise<{ success: boolean }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('recording.stop', options, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else {
          console.log(`⏹️  Aufzeichnung gestoppt: ${options.recordingUuid}`);
          resolve({ success: response.success });
        }
      });
    });
  }

  /** Anrufaufzeichnung abrufen */
  async retrieveRecording(options: {
    recordingUuid: string;
  }): Promise<{ data: Buffer; contentType: string }> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('recording.retrieve', options, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else {
          console.log(`📥 Aufzeichnung abgerufen: ${options.recordingUuid}`);
          // Convert base64 back to Buffer
          const buffer = Buffer.from(response.data, 'base64');
          resolve({ data: buffer, contentType: response.contentType });
        }
      });
    });
  }

  /** Kunde in CSV nachschlagen */
  async lookupCustomer(customerNumber: string): Promise<any> {
    const csvPath = path.join(__dirname, '../workshop-data/customers.csv');
    const content = await fs.readFile(csvPath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    return records.find((r: any) => r.customer_number === customerNumber);
  }

  /** Zählerstand speichern */
  async saveMeterReading(data: {
    customerNumber: string;
    meterNumber: string;
    reading: number;
  }): Promise<void> {
    const csvPath = path.join(__dirname, '../workshop-data/meter-readings.csv');
    const timestamp = new Date();

    const line = `\n${data.customerNumber},${data.meterNumber},${data.reading},${timestamp.toISOString().split('T')[0]},${timestamp.toTimeString().split(' ')[0]},call_${Date.now()},workshop`;

    await fs.appendFile(csvPath, line);
    console.log('💾 Zählerstand gespeichert!');
  }

  private createCallHandle(callData: any): CallHandle {
    return {
      callId: callData.callId,
      callUuid: callData.callUuid,
      sessionId: callData.sessionId,

      say: async (text: string) => {
        await this.sendAction({ type: 'say', text });
      },

      collectSpeech: async (options = {}) => {
        await this.sendAction({
          type: 'collect_speech',
          language: 'de-DE',
          ...options
        });
        return new Promise<string>((resolve) => {
          this.once('call.user_input', resolve);
        });
      },

      collectDigits: async (options) => {
        await this.sendAction({ type: 'collect_digits', ...options });
        return new Promise<string>((resolve) => {
          this.once('call.user_input', resolve);
        });
      },

      bridge: async (destination: string, options = {}) => {
        await this.sendAction({
          type: 'bridge',
          destination,
          destinationType: options.destinationType || 'SIP_USER',
          timeout: options.timeout || 30
        });
      },

      transfer: async (destination: string) => {
        await this.sendAction({ type: 'transfer', destination });
      },

      hangup: async (message?: string) => {
        await this.sendAction({ type: 'hangup', message });
      },

      playAnnouncement: async (announcementName: string) => {
        await this.sendAction({ type: 'play_announcement', announcementName });
      },

      aiConversation: async (options) => {
        await this.sendAction({ type: 'ai_conversation', ...options });

        const messages: any[] = [];
        let turnCount = 0;

        return new Promise((resolve) => {
          const handler = (data: any) => {
            messages.push(data);
            turnCount = data.turn + 1;

            if (data.response.includes('[END_CALL]')) {
              this.off('ai.response', handler);
              resolve({ messages, turnCount });
            }
          };

          this.on('ai.response', handler);

          setTimeout(() => {
            this.off('ai.response', handler);
            resolve({ messages, turnCount });
          }, (options.maxTurns || 10) * 30000);
        });
      },

      extractCustomerInfo: async (text: string) => {
        return new Promise((resolve) => {
          this.socket?.emit('extract.info', { text }, (response: any) => {
            resolve(response || {});
          });
        });
      }
    };
  }

  private async sendAction(action: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('call.action', action, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve();
      });
    });
  }
}

/** Helper-Funktion: Session erstellen */
export async function createVoiceSession(options?: VoiceSessionOptions): Promise<VoiceSession> {
  const session = new VoiceSession(options);
  await session.start();
  return session;
}
