/**
 * IVU Voice Client SDK
 *
 * Verbindet sich mit dem IVU Voice API Server und ermöglicht
 * einfache Steuerung von Voice-Calls über WebSocket.
 *
 * Workshop-Teilnehmer nutzen nur diese Datei - der Server läuft bei IVU.
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
}

export interface CallHandle {
  callId: string;
  sessionId: string;

  /** Text aussprechen (Text-to-Speech) */
  say(text: string): Promise<void>;

  /** Spracheingabe sammeln (ASR) */
  collectSpeech(options?: { prompt?: string; timeout?: number }): Promise<string>;

  /** DTMF-Ziffern sammeln */
  collectDigits(options: { maxDigits: number; prompt?: string }): Promise<string>;

  /** Anruf weiterleiten */
  transfer(destination: string): Promise<void>;

  /** Anruf beenden */
  hangup(message?: string): Promise<void>;

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
    this.serverUrl = options.serverUrl || 'ws://voice-api.ivu.de';
  }

  /** Session starten (verbindet mit IVU-Server) */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`📡 Verbinde mit IVU Voice API: ${this.serverUrl}`);

      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        reconnection: true
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

      transfer: async (destination: string) => {
        await this.sendAction({ type: 'transfer', destination });
      },

      hangup: async (message?: string) => {
        await this.sendAction({ type: 'hangup', message });
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
