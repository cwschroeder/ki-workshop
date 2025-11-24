import WebSocket, { WebSocketServer } from 'ws';
import { TranscriptUpdate } from '../models/TranscriptUpdate';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'TranscriptWebSocketServer' });

export class TranscriptWebSocketServer {
  private server: WebSocketServer;

  constructor(port: number) {
    this.server = new WebSocketServer({ port });

    this.server.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'ready', message: 'transcript stream ready' }));
    });

    this.server.on('listening', () => {
      logger.info({ port }, 'Transcript WebSocket listening');
    });

    this.server.on('error', (error) => {
      logger.error({ error }, 'Transcript WebSocket error');
    });
  }

  broadcast(update: TranscriptUpdate): void {
    const payload = JSON.stringify(update);

    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  close(): void {
    this.server.close();
  }
}
