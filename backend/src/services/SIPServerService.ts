import dgram from 'dgram';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { RTPAudioHandler } from './RTPAudioHandler';

interface SIPCall {
  callId: string;
  from: string;
  to: string;
  rtpHandler: RTPAudioHandler;
  remoteAddress: string;
  remotePort: number;
  tag: string;
}

/**
 * Simple UDP-based SIP Server with REGISTER support
 * Handles incoming SIP calls and manages RTP sessions
 */
export class SIPServerService extends EventEmitter {
  private sipPort: number;
  private rtpPortRange: { min: number; max: number };
  private activeCalls: Map<string, SIPCall> = new Map();
  private username: string;
  private password: string;
  private domain: string;
  private socket: dgram.Socket | null = null;
  private registrationInterval: NodeJS.Timeout | null = null;
  private localIP: string = '';
  private advertisedIP: string = '';
  private cseqCounter: number = 1;

  constructor(
    sipPort: number = 5060,
    username: string = 'cwschroeder',
    domain: string = '204671.tenios.com',
    password: string = 'passwort123456'
  ) {
    super();
    this.sipPort = sipPort;
    this.username = username;
    this.domain = domain;
    this.password = password;
    this.rtpPortRange = { min: 10000, max: 20000 };
  }

  async start(): Promise<void> {
    logger.info({ port: this.sipPort }, 'Starting SIP server');

    // Get local IP address
    await this.getLocalIP();

    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      logger.info({ from: `${rinfo.address}:${rinfo.port}`, size: msg.length }, 'Received SIP message');
      logger.debug({ message: message.substring(0, 500) }, 'SIP message preview');

      this.handleSIPMessage(message, rinfo.address, rinfo.port);
    });

    this.socket.on('error', (err) => {
      logger.error({ error: err }, 'SIP socket error');
    });

    return new Promise((resolve) => {
      this.socket!.bind(this.sipPort, () => {
        logger.info({ port: this.sipPort }, 'SIP server listening');

        // Start SIP REGISTER (re-registration interval will be set after 200 OK)
        this.registerWithServer();

        resolve();
      });
    });
  }

  private async getLocalIP(): Promise<void> {
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        // Skip internal and non-IPv4 addresses
        if (!net.internal && net.family === 'IPv4') {
          this.localIP = net.address;
          logger.info({ localIP: this.localIP }, 'Detected local IP');
          this.advertisedIP = this.localIP;
          return;
        }
      }
    }

    this.localIP = '127.0.0.1';
    logger.warn('Could not detect local IP, using 127.0.0.1');
  }

  private handleSIPMessage(message: string, remoteAddress: string, remotePort: number): void {
    const lines = message.split('\r\n');
    const firstLine = lines[0];

    // Check if it's a response (SIP/2.0 ...) or request (METHOD ...)
    if (firstLine.startsWith('SIP/2.0')) {
      // It's a response
      this.handleRegisterResponse(message);
      return;
    }

    // Parse method from request
    const methodMatch = firstLine.match(/^([A-Z]+)\s/);
    if (!methodMatch) {
      logger.warn({ firstLine }, 'Invalid SIP message');
      return;
    }

    const method = methodMatch[1];
    const callId = this.extractHeader(message, 'Call-ID');
    const from = this.extractHeader(message, 'From');
    const to = this.extractHeader(message, 'To');
    const via = this.extractHeader(message, 'Via');
    const cseq = this.extractHeader(message, 'CSeq');

    logger.info({ method, callId, from: from.substring(0, 50), to: to.substring(0, 50) }, 'Parsed SIP request');

    switch (method) {
      case 'INVITE':
        this.handleInvite(message, remoteAddress, remotePort, callId, from, to, via, cseq);
        break;
      case 'ACK':
        logger.info({ callId }, 'Received ACK');
        break;
      case 'BYE':
        this.handleBye(message, remoteAddress, remotePort, callId, via, cseq);
        break;
      case 'CANCEL':
        this.sendResponse(200, 'OK', message, remoteAddress, remotePort, via, cseq);
        break;
      default:
        logger.warn({ method }, 'Unhandled SIP method');
        this.sendResponse(405, 'Method Not Allowed', message, remoteAddress, remotePort, via, cseq);
    }
  }

  private async handleInvite(
    message: string,
    remoteAddress: string,
    remotePort: number,
    callId: string,
    from: string,
    to: string,
    via: string,
    cseq: string
  ): Promise<void> {
    try {
      // Extract SDP body
      const sdpStart = message.indexOf('\r\n\r\n') + 4;
      const sdpBody = message.substring(sdpStart);

      // Parse remote RTP port and IP from SDP
      const audioMatch = sdpBody.match(/m=audio\s+(\d+)/);
      const remoteRTPPort = audioMatch ? parseInt(audioMatch[1]) : 0;

      // Parse connection IP (c=IN IP4 <ip>)
      const connectionMatch = sdpBody.match(/c=IN IP4 ([\d.]+)/);
      const remoteRTPAddress = connectionMatch ? connectionMatch[1] : remoteAddress;

      // Determine preferred codec (PCMA if offered, else PCMU)
      const offersPCMA = /a=rtpmap:8\s+PCMA\/8000/i.test(sdpBody) || /m=audio\s+\d+\s+RTP\/AVP[^\r\n]*\b8\b/.test(sdpBody);
      const selectedPayloadType = offersPCMA ? 8 : 0;

      logger.info({ callId, remoteRTPPort, remoteRTPAddress }, 'Parsed SDP from INVITE');

      // Allocate local RTP port
      const localRTPPort = this.allocateRTPPort();
      const rtpHandler = new RTPAudioHandler(localRTPPort);
      rtpHandler.setPayloadType(selectedPayloadType);
      await rtpHandler.start();

      // Set remote RTP endpoint immediately (for NAT traversal)
      rtpHandler.setRemoteEndpoint(remoteRTPAddress, remoteRTPPort);
      logger.info({ callId, selectedPayloadType }, 'RTP payload type selected');

      // Extract tag from From header for dialog tracking
      const toTag = Math.random().toString(36).substring(2, 15);

      // Store call
      const call: SIPCall = {
        callId,
        from,
        to,
        rtpHandler,
        remoteAddress,
        remotePort,
        tag: toTag
      };
      this.activeCalls.set(callId, call);

      // Create SDP answer
      const sdp = this.createSDP(localRTPPort, this.getAdvertisedIP(remoteAddress), selectedPayloadType);

      // Send 100 Trying
      this.sendResponse(100, 'Trying', message, remoteAddress, remotePort, via, cseq);

      // Send 200 OK with SDP
      const response = this.createResponse(200, 'OK', via, from, to, callId, cseq, toTag);
      const contactHeader = `Contact: <sip:${this.username}@${this.getAdvertisedIP(remoteAddress)}:${this.sipPort};transport=udp>\r\n`;

      const fullResponse = response +
        contactHeader +
        'Content-Type: application/sdp\r\n' +
        `Content-Length: ${sdp.length}\r\n` +
        '\r\n' +
        sdp;

      this.sendRaw(fullResponse, remoteAddress, remotePort);
      logger.debug({ callId, sdp }, 'Sent SDP answer');

      logger.info({ callId, localRTPPort, toTag }, 'Call answered with 200 OK');

      // Emit call started event
      this.emit('callStarted', { callId, rtpHandler });

    } catch (error) {
      logger.error({ error, callId }, 'Failed to handle INVITE');
      this.sendResponse(500, 'Internal Server Error', message, remoteAddress, remotePort, via, cseq);
    }
  }

  private async handleBye(
    message: string,
    remoteAddress: string,
    remotePort: number,
    callId: string,
    via: string,
    cseq: string
  ): Promise<void> {
    const call = this.activeCalls.get(callId);

    if (call) {
      const reason = this.extractHeader(message, 'Reason');
      logger.info({ callId, reason }, 'Call ended (BYE received)');

      await call.rtpHandler.stop();
      this.activeCalls.delete(callId);

      this.sendResponse(200, 'OK', message, remoteAddress, remotePort, via, cseq);
      this.emit('callEnded', { callId });
    } else {
      logger.warn({ callId }, 'BYE for unknown call');
      this.sendResponse(481, 'Call/Transaction Does Not Exist', message, remoteAddress, remotePort, via, cseq);
    }
  }

  private createResponse(
    statusCode: number,
    reason: string,
    via: string,
    from: string,
    to: string,
    callId: string,
    cseq: string,
    toTag?: string
  ): string {
    const toHeader = toTag && !to.includes('tag=') ? to.replace('>', `;tag=${toTag}>`) : to;

    return `SIP/2.0 ${statusCode} ${reason}\r\n` +
      `Via: ${via}\r\n` +
      `From: ${from}\r\n` +
      `To: ${toHeader}\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: ${cseq}\r\n`;
  }

  private sendResponse(
    statusCode: number,
    reason: string,
    request: string,
    remoteAddress: string,
    remotePort: number,
    via: string,
    cseq: string
  ): void {
    const callId = this.extractHeader(request, 'Call-ID');
    const from = this.extractHeader(request, 'From');
    const to = this.extractHeader(request, 'To');

    const response = this.createResponse(statusCode, reason, via, from, to, callId, cseq) +
      'Content-Length: 0\r\n\r\n';

    this.sendRaw(response, remoteAddress, remotePort);
  }

  private sendRaw(message: string, address: string, port: number): void {
    if (!this.socket) return;

    const buffer = Buffer.from(message);
    this.socket.send(buffer, port, address, (err) => {
      if (err) {
        logger.error({ error: err, address, port }, 'Failed to send SIP message');
      } else {
        logger.debug({ address, port, size: buffer.length }, 'Sent SIP message');
      }
    });
  }

  private createSDP(rtpPort: number, connectionAddress: string, payloadType: number): string {
    const codecLine = payloadType === 8 ? '8' : '0';
    const rtpmapCodec = payloadType === 8 ? 'a=rtpmap:8 PCMA/8000' : 'a=rtpmap:0 PCMU/8000';

    return [
      'v=0',
      `o=- ${Date.now()} ${Date.now()} IN IP4 ${connectionAddress}`,
      's=Voice Agent',
      `c=IN IP4 ${connectionAddress}`,
      't=0 0',
      `m=audio ${rtpPort} RTP/AVP ${codecLine} 101`,
      rtpmapCodec,
      'a=rtpmap:101 telephone-event/8000',
      'a=fmtp:101 0-16',
      'a=ptime:20',
      'a=sendrecv',
      ''
    ].join('\r\n');
  }

  /**
   * Use the best IP to advertise in SDP: public (if known) else detected local else fallback
   */
  private getAdvertisedIP(fallback: string): string {
    return this.advertisedIP || this.localIP || fallback;
  }

  private extractHeader(message: string, headerName: string): string {
    // Support both full name and compact form
    const compactForms: { [key: string]: string } = {
      'Call-ID': 'i',
      'From': 'f',
      'To': 't',
      'Via': 'v',
      'Contact': 'm'
    };

    const patterns = [headerName];
    if (compactForms[headerName]) {
      patterns.push(compactForms[headerName]);
    }

    for (const pattern of patterns) {
      const regex = new RegExp(`^${pattern}:\\s*(.+)$`, 'im');
      const match = message.match(regex);
      if (match) return match[1].trim();
    }

    return '';
  }

  private allocateRTPPort(): number {
    return Math.floor(
      Math.random() * (this.rtpPortRange.max - this.rtpPortRange.min) + this.rtpPortRange.min
    );
  }

  getRTPHandler(callId: string): RTPAudioHandler | null {
    return this.activeCalls.get(callId)?.rtpHandler || null;
  }

  /**
   * Register with SIP server
   */
  private registerWithServer(): void {
    const callId = `${Math.random().toString(36).substring(2)}@${this.localIP}`;
    const tag = Math.random().toString(36).substring(2, 15);
    const branch = `z9hG4bK${Math.random().toString(36).substring(2)}`;

    const contactIP = this.advertisedIP || this.localIP;

    const registerMessage =
      `REGISTER sip:${this.domain} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.localIP}:${this.sipPort};branch=${branch}\r\n` +
      `From: <sip:${this.username}@${this.domain}>;tag=${tag}\r\n` +
      `To: <sip:${this.username}@${this.domain}>\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: ${this.cseqCounter++} REGISTER\r\n` +
      `Contact: <sip:${this.username}@${contactIP}:${this.sipPort}>\r\n` +
      `Expires: 300\r\n` +
      `Content-Length: 0\r\n\r\n`;

    logger.info({ domain: this.domain }, 'Sending REGISTER request');
    this.sendRaw(registerMessage, this.domain, 5060);
  }

  /**
   * Handle REGISTER response (including 401 Unauthorized)
   */
  private handleRegisterResponse(message: string): void {
    const statusMatch = message.match(/^SIP\/2\.0\s+(\d+)\s+(.+)$/m);
    if (!statusMatch) return;

    const statusCode = parseInt(statusMatch[1]);
    const statusText = statusMatch[2];

    logger.info({ statusCode, statusText }, 'Received REGISTER response');

    if (statusCode === 401) {
      // Extract authentication challenge
      const wwwAuth = this.extractHeader(message, 'WWW-Authenticate');
      const realm = this.extractParameter(wwwAuth, 'realm');
      const nonce = this.extractParameter(wwwAuth, 'nonce');

      logger.info({ realm, nonce: nonce.substring(0, 20) }, 'Received auth challenge');

      // Send authenticated REGISTER
      this.registerWithAuth(message, realm, nonce);
    } else if (statusCode === 200) {
      // Capture public IP from Via received or Contact for SDP advertisement
      const viaHeader = this.extractHeader(message, 'Via');
      const receivedMatch = viaHeader.match(/received=([\d.]+)/);
      if (receivedMatch) {
        this.advertisedIP = receivedMatch[1];
        logger.info({ advertisedIP: this.advertisedIP }, 'Detected public IP from Via received');
      }

      const contactHeader = this.extractHeader(message, 'Contact');
      const contactIpMatch = contactHeader.match(/sip:[^@]+@([\d.]+)/);
      if (!this.advertisedIP && contactIpMatch) {
        this.advertisedIP = contactIpMatch[1];
        logger.info({ advertisedIP: this.advertisedIP }, 'Detected public IP from Contact');
      }

      // Extract expires from Contact header
      const contact = this.extractHeader(message, 'Contact');
      const expiresMatch = contact.match(/expires=(\d+)/i);
      const expires = expiresMatch ? parseInt(expiresMatch[1]) : 300;

      logger.info({ expires }, '✅ Successfully registered with SIP server');

      // Clear old interval
      if (this.registrationInterval) {
        clearInterval(this.registrationInterval);
      }

      // Re-register before expiry (at 80% of expiry time)
      const reregisterTime = Math.floor(expires * 0.8) * 1000;
      this.registrationInterval = setInterval(() => {
        this.registerWithServer();
      }, reregisterTime);

      logger.debug({ reregisterTime: reregisterTime / 1000 }, 'Next REGISTER scheduled');
    } else {
      logger.warn({ statusCode, statusText }, 'Unexpected REGISTER response');
    }
  }

  /**
   * Send authenticated REGISTER
   */
  private registerWithAuth(originalMessage: string, realm: string, nonce: string): void {
    const callId = this.extractHeader(originalMessage, 'Call-ID');
    const fromHeader = this.extractHeader(originalMessage, 'From');
    const fromTag = this.extractParameter(fromHeader, 'tag');
    const branch = `z9hG4bK${Math.random().toString(36).substring(2)}`;
    const contactIP = this.advertisedIP || this.localIP;

    logger.debug({ fromHeader, fromTag, callId }, 'Extracted headers for auth REGISTER');

    // Calculate digest response
    const uri = `sip:${this.domain}`;
    const response = this.calculateDigestResponse('REGISTER', uri, realm, nonce);

    const authHeader =
      `Digest username="${this.username}", ` +
      `realm="${realm}", ` +
      `nonce="${nonce}", ` +
      `uri="${uri}", ` +
      `response="${response}", ` +
      `algorithm=MD5`;

    const registerMessage =
      `REGISTER sip:${this.domain} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.localIP}:${this.sipPort};branch=${branch}\r\n` +
      `From: <sip:${this.username}@${this.domain}>;tag=${fromTag}\r\n` +
      `To: <sip:${this.username}@${this.domain}>\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: ${this.cseqCounter++} REGISTER\r\n` +
      `Contact: <sip:${this.username}@${contactIP}:${this.sipPort}>\r\n` +
      `Authorization: ${authHeader}\r\n` +
      `Expires: 300\r\n` +
      `Content-Length: 0\r\n\r\n`;

    logger.debug({ registerMessage: registerMessage.substring(0, 400) }, 'Full authenticated REGISTER message');
    logger.info('Sending authenticated REGISTER');
    this.sendRaw(registerMessage, this.domain, 5060);
  }

  /**
   * Calculate MD5 digest response for SIP authentication
   */
  private calculateDigestResponse(method: string, uri: string, realm: string, nonce: string): string {
    const ha1 = createHash('md5')
      .update(`${this.username}:${realm}:${this.password}`)
      .digest('hex');

    const ha2 = createHash('md5')
      .update(`${method}:${uri}`)
      .digest('hex');

    const response = createHash('md5')
      .update(`${ha1}:${nonce}:${ha2}`)
      .digest('hex');

    return response;
  }

  /**
   * Extract parameter value from header (supports both quoted and unquoted values)
   */
  private extractParameter(header: string, key: string): string {
    // Try quoted value first: key="value"
    let regex = new RegExp(`${key}="([^"]+)"`, 'i');
    let match = header.match(regex);
    if (match) return match[1];

    // Try unquoted value: key=value (terminated by semicolon, space, or end of string)
    regex = new RegExp(`${key}=([^;\\s>]+)`, 'i');
    match = header.match(regex);
    return match ? match[1] : '';
  }

  async stop(): Promise<void> {
    logger.info('Stopping SIP server');

    // Clear registration interval
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
      this.registrationInterval = null;
    }

    for (const [callId, call] of this.activeCalls) {
      await call.rtpHandler.stop();
      this.activeCalls.delete(callId);
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    logger.info('SIP server stopped');
  }
}
