import dgram from 'dgram';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { RTPAudioHandler } from './RTPAudioHandler';

interface SIPCall {
  callId: string;
  from: string;
  to: string;
  rtpHandler: RTPAudioHandler;
  remoteAddress: string;
  remotePort: number;
  tag: string;
  direction: 'inbound' | 'outbound';
  state: 'calling' | 'ringing' | 'established' | 'terminated';
}

interface OutboundCallOptions {
  toUri: string;
  fromDisplayName?: string;
}

/**
 * Simple UDP-based SIP Server with REGISTER support
 * Handles incoming SIP calls and manages RTP sessions
 */
export class SIPServerService extends EventEmitter {
  private sipPort: number;
  private rtpPortRange: { min: number; max: number };
  private activeCalls: Map<string, SIPCall> = new Map();
  private allocatedRTPPorts: Set<number> = new Set();
  private nextRTPPort: number;
  private username: string;
  private password: string;
  private domain: string;
  private socket: dgram.Socket | null = null;
  private registrationInterval: NodeJS.Timeout | null = null;
  private localIP: string = '';
  private advertisedIP: string = '';
  private cseqCounter: number = 1;

  private skipRegistration: boolean = false;

  constructor(
    sipPort: number = 5060,
    username: string = 'cwschroeder',
    domain: string = '204671.tenios.com',
    password: string = 'passwort123456',
    publicIP?: string,
    skipRegistration: boolean = false
  ) {
    super();
    this.sipPort = sipPort;
    this.username = username;
    this.domain = domain;
    this.password = password;
    this.rtpPortRange = { min: 10000, max: 20000 };
    this.nextRTPPort = this.rtpPortRange.min;
    this.skipRegistration = skipRegistration;

    // If public IP provided, use it for advertising; otherwise auto-detect
    if (publicIP) {
      this.advertisedIP = publicIP;
      console.log(`[SIPServer] Using configured public IP: ${publicIP}`);
    }
  }

  async start(): Promise<void> {
    console.log(`[SIPServer] Starting on port ${this.sipPort}`);

    // Get local IP address
    await this.getLocalIP();

    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      console.log(`[SIPServer] Received from ${rinfo.address}:${rinfo.port}, size: ${msg.length}`);

      this.handleSIPMessage(message, rinfo.address, rinfo.port);
    });

    this.socket.on('error', (err) => {
      console.error('[SIPServer] Socket error:', err);
    });

    return new Promise((resolve) => {
      this.socket!.bind(this.sipPort, () => {
        console.log(`[SIPServer] Listening on port ${this.sipPort}`);

        // Start SIP REGISTER only if not skipped (for peer-to-peer mode)
        if (!this.skipRegistration) {
          this.registerWithServer();
        } else {
          console.log('[SIPServer] Peer-to-peer mode: skipping SIP REGISTER');
        }

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
          console.log(`[SIPServer] Detected local IP: ${this.localIP}`);
          // Only set advertisedIP if not already configured via constructor
          if (!this.advertisedIP) {
            this.advertisedIP = this.localIP;
          }
          return;
        }
      }
    }

    this.localIP = '127.0.0.1';
    console.warn('[SIPServer] Could not detect local IP, using 127.0.0.1');
  }

  private handleSIPMessage(message: string, remoteAddress: string, remotePort: number): void {
    const lines = message.split('\r\n');
    const firstLine = lines[0];

    // Check if it's a response (SIP/2.0 ...) or request (METHOD ...)
    if (firstLine.startsWith('SIP/2.0')) {
      // It's a response - could be REGISTER or INVITE response
      const cseq = this.extractHeader(message, 'CSeq');

      if (cseq.includes('REGISTER')) {
        this.handleRegisterResponse(message);
      } else if (cseq.includes('INVITE')) {
        this.handleInviteResponse(message, remoteAddress, remotePort);
      } else {
        console.warn(`[SIPServer] Unhandled response type: ${cseq}`);
      }
      return;
    }

    // Parse method from request
    const methodMatch = firstLine.match(/^([A-Z]+)\s/);
    if (!methodMatch) {
      console.warn(`[SIPServer] Invalid SIP message: ${firstLine}`);
      return;
    }

    const method = methodMatch[1];
    const callId = this.extractHeader(message, 'Call-ID');
    const from = this.extractHeader(message, 'From');
    const to = this.extractHeader(message, 'To');
    const via = this.extractHeader(message, 'Via');
    const cseq = this.extractHeader(message, 'CSeq');

    console.log(`[SIPServer] ${method} request, Call-ID: ${callId}`);

    switch (method) {
      case 'INVITE':
        this.handleInvite(message, remoteAddress, remotePort, callId, from, to, via, cseq);
        break;
      case 'ACK':
        console.log(`[SIPServer] ACK received for ${callId}`);
        break;
      case 'BYE':
        this.handleBye(message, remoteAddress, remotePort, callId, via, cseq);
        break;
      case 'CANCEL':
        this.sendResponse(200, 'OK', message, remoteAddress, remotePort, via, cseq);
        break;
      default:
        console.warn(`[SIPServer] Unhandled method: ${method}`);
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
      const offersPCMA =
        /a=rtpmap:8\s+PCMA\/8000/i.test(sdpBody) ||
        /m=audio\s+\d+\s+RTP\/AVP[^\r\n]*\b8\b/.test(sdpBody);
      const selectedPayloadType = offersPCMA ? 8 : 0;

      // Check if this is a re-INVITE for an existing call
      const existingCall = this.activeCalls.get(callId);
      if (existingCall) {
        console.log(
          `[SIPServer] re-INVITE for existing call ${callId}, updating RTP: ${remoteRTPAddress}:${remoteRTPPort}`
        );

        // Update remote RTP endpoint (may have changed due to NAT)
        existingCall.rtpHandler.setRemoteEndpoint(remoteRTPAddress, remoteRTPPort);

        // Create SDP answer with existing port
        const localRTPPort = existingCall.rtpHandler.getLocalPort();
        const sdp = this.createSDP(
          localRTPPort,
          this.getAdvertisedIP(remoteAddress),
          selectedPayloadType
        );

        // Send 200 OK with SDP (no 100 Trying for re-INVITE)
        const response = this.createResponse(200, 'OK', via, from, to, callId, cseq, existingCall.tag);
        const contactHeader = `Contact: <sip:${this.username}@${this.getAdvertisedIP(remoteAddress)}:${this.sipPort};transport=udp>\r\n`;

        const fullResponse =
          response +
          contactHeader +
          'Content-Type: application/sdp\r\n' +
          `Content-Length: ${sdp.length}\r\n` +
          '\r\n' +
          sdp;

        this.sendRaw(fullResponse, remoteAddress, remotePort);

        console.log(`[SIPServer] re-INVITE answered for ${callId}`);
        return; // Don't emit callStarted for re-INVITE
      }

      console.log(
        `[SIPServer] INVITE from ${from}, RTP: ${remoteRTPAddress}:${remoteRTPPort}, codec: ${selectedPayloadType === 8 ? 'PCMA' : 'PCMU'}`
      );

      // Allocate local RTP port
      const localRTPPort = this.allocateRTPPort();
      const rtpHandler = new RTPAudioHandler(localRTPPort);
      rtpHandler.setPayloadType(selectedPayloadType);
      await rtpHandler.start();

      // Set remote RTP endpoint immediately (for NAT traversal)
      rtpHandler.setRemoteEndpoint(remoteRTPAddress, remoteRTPPort);

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
        tag: toTag,
        direction: 'inbound',
        state: 'established'
      };
      this.activeCalls.set(callId, call);

      // Create SDP answer
      const sdp = this.createSDP(
        localRTPPort,
        this.getAdvertisedIP(remoteAddress),
        selectedPayloadType
      );

      // Send 100 Trying
      this.sendResponse(100, 'Trying', message, remoteAddress, remotePort, via, cseq);

      // Send 200 OK with SDP
      const response = this.createResponse(200, 'OK', via, from, to, callId, cseq, toTag);
      const contactHeader = `Contact: <sip:${this.username}@${this.getAdvertisedIP(remoteAddress)}:${this.sipPort};transport=udp>\r\n`;

      const fullResponse =
        response +
        contactHeader +
        'Content-Type: application/sdp\r\n' +
        `Content-Length: ${sdp.length}\r\n` +
        '\r\n' +
        sdp;

      this.sendRaw(fullResponse, remoteAddress, remotePort);

      console.log(`[SIPServer] Call answered: ${callId}, local RTP port: ${localRTPPort}`);

      // Emit call started event
      this.emit('callStarted', { callId, rtpHandler });
    } catch (error) {
      console.error(`[SIPServer] Failed to handle INVITE:`, error);
      this.sendResponse(
        500,
        'Internal Server Error',
        message,
        remoteAddress,
        remotePort,
        via,
        cseq
      );
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
      console.log(`[SIPServer] BYE received for ${callId}, reason: ${reason}`);

      const rtpPort = call.rtpHandler.getLocalPort();
      await call.rtpHandler.stop();
      this.freeRTPPort(rtpPort);
      this.activeCalls.delete(callId);

      this.sendResponse(200, 'OK', message, remoteAddress, remotePort, via, cseq);
      this.emit('callEnded', { callId });
    } else {
      console.warn(`[SIPServer] BYE for unknown call: ${callId}`);
      this.sendResponse(
        481,
        'Call/Transaction Does Not Exist',
        message,
        remoteAddress,
        remotePort,
        via,
        cseq
      );
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

    return (
      `SIP/2.0 ${statusCode} ${reason}\r\n` +
      `Via: ${via}\r\n` +
      `From: ${from}\r\n` +
      `To: ${toHeader}\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: ${cseq}\r\n`
    );
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

    const response =
      this.createResponse(statusCode, reason, via, from, to, callId, cseq) +
      'Content-Length: 0\r\n\r\n';

    this.sendRaw(response, remoteAddress, remotePort);
  }

  private sendRaw(message: string, address: string, port: number): void {
    if (!this.socket) return;

    const buffer = Buffer.from(message);
    this.socket.send(buffer, port, address, (err) => {
      if (err) {
        console.error(`[SIPServer] Failed to send to ${address}:${port}:`, err);
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
      From: 'f',
      To: 't',
      Via: 'v',
      Contact: 'm'
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
    // Sequential allocation to avoid race conditions
    const startPort = this.nextRTPPort;
    do {
      const port = this.nextRTPPort;
      this.nextRTPPort++;
      if (this.nextRTPPort > this.rtpPortRange.max) {
        this.nextRTPPort = this.rtpPortRange.min;
      }

      if (!this.allocatedRTPPorts.has(port)) {
        this.allocatedRTPPorts.add(port);
        return port;
      }
    } while (this.nextRTPPort !== startPort);

    throw new Error('Unable to allocate RTP port - all ports in use');
  }

  private freeRTPPort(port: number): void {
    this.allocatedRTPPorts.delete(port);
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

    console.log(`[SIPServer] Sending REGISTER to ${this.domain}`);
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

    console.log(`[SIPServer] REGISTER response: ${statusCode} ${statusText}`);

    if (statusCode === 401) {
      // Extract authentication challenge
      const wwwAuth = this.extractHeader(message, 'WWW-Authenticate');
      const realm = this.extractParameter(wwwAuth, 'realm');
      const nonce = this.extractParameter(wwwAuth, 'nonce');

      console.log(`[SIPServer] Auth challenge received, realm: ${realm}`);

      // Send authenticated REGISTER
      this.registerWithAuth(message, realm, nonce);
    } else if (statusCode === 200) {
      // Capture public IP from Via received or Contact for SDP advertisement
      const viaHeader = this.extractHeader(message, 'Via');
      const receivedMatch = viaHeader.match(/received=([\d.]+)/);
      if (receivedMatch) {
        this.advertisedIP = receivedMatch[1];
        console.log(`[SIPServer] Detected public IP from Via: ${this.advertisedIP}`);
      }

      const contactHeader = this.extractHeader(message, 'Contact');
      const contactIpMatch = contactHeader.match(/sip:[^@]+@([\d.]+)/);
      if (!this.advertisedIP && contactIpMatch) {
        this.advertisedIP = contactIpMatch[1];
        console.log(`[SIPServer] Detected public IP from Contact: ${this.advertisedIP}`);
      }

      // Extract expires from Contact header
      const contact = this.extractHeader(message, 'Contact');
      const expiresMatch = contact.match(/expires=(\d+)/i);
      const expires = expiresMatch ? parseInt(expiresMatch[1]) : 300;

      console.log(`[SIPServer] ✅ Successfully registered, expires: ${expires}s`);

      // Clear old interval
      if (this.registrationInterval) {
        clearInterval(this.registrationInterval);
      }

      // Re-register before expiry (at 80% of expiry time)
      const reregisterTime = Math.floor(expires * 0.8) * 1000;
      this.registrationInterval = setInterval(() => {
        this.registerWithServer();
      }, reregisterTime);
    } else {
      console.warn(`[SIPServer] Unexpected REGISTER response: ${statusCode} ${statusText}`);
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

    console.log('[SIPServer] Sending authenticated REGISTER');
    this.sendRaw(registerMessage, this.domain, 5060);
  }

  /**
   * Calculate MD5 digest response for SIP authentication
   */
  private calculateDigestResponse(
    method: string,
    uri: string,
    realm: string,
    nonce: string
  ): string {
    const ha1 = createHash('md5')
      .update(`${this.username}:${realm}:${this.password}`)
      .digest('hex');

    const ha2 = createHash('md5').update(`${method}:${uri}`).digest('hex');

    const response = createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');

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

  /**
   * Initiate an outbound SIP call
   * Returns the call ID which can be used to track the call state
   */
  async initiateOutboundCall(options: OutboundCallOptions): Promise<string> {
    const { toUri, fromDisplayName } = options;

    // Generate call identifiers
    const callId = `${Math.random().toString(36).substring(2)}@${this.localIP}`;
    const fromTag = Math.random().toString(36).substring(2, 15);
    const branch = `z9hG4bK${Math.random().toString(36).substring(2)}`;

    // Allocate RTP port and create handler
    const localRTPPort = this.allocateRTPPort();
    const rtpHandler = new RTPAudioHandler(localRTPPort);
    rtpHandler.setPayloadType(0); // Start with PCMU, can negotiate later
    await rtpHandler.start();

    const contactIP = this.advertisedIP || this.localIP;

    // Create SDP offer
    const sdp = this.createSDP(localRTPPort, contactIP, 0);

    // Construct From and To URIs
    const fromUri = `<sip:${this.username}@${this.domain}>`;
    const fromHeader = fromDisplayName
      ? `"${fromDisplayName}" ${fromUri};tag=${fromTag}`
      : `${fromUri};tag=${fromTag}`;

    const toHeader = `<${toUri}>`;

    // Parse destination from toUri (extract domain and port)
    const uriMatch = toUri.match(/sip:([^@]+)@([^:;>]+)(?::(\d+))?/);
    if (!uriMatch) {
      throw new Error(`Invalid SIP URI: ${toUri}`);
    }
    const [, , destDomain, destPortStr] = uriMatch;
    const destPort = destPortStr ? parseInt(destPortStr) : 5060;

    console.log(`[SIPServer] Initiating outbound call to ${toUri}`);

    // Create INVITE message
    const inviteMessage =
      `INVITE ${toUri} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.localIP}:${this.sipPort};branch=${branch}\r\n` +
      `From: ${fromHeader}\r\n` +
      `To: ${toHeader}\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: 1 INVITE\r\n` +
      `Contact: <sip:${this.username}@${contactIP}:${this.sipPort}>\r\n` +
      `Max-Forwards: 70\r\n` +
      `User-Agent: VoiceAgent/1.0\r\n` +
      `Content-Type: application/sdp\r\n` +
      `Content-Length: ${sdp.length}\r\n` +
      `\r\n` +
      sdp;

    // Store call in calling state
    const call: SIPCall = {
      callId,
      from: fromHeader,
      to: toHeader,
      rtpHandler,
      remoteAddress: destDomain,
      remotePort: destPort,
      tag: fromTag,
      direction: 'outbound',
      state: 'calling'
    };
    this.activeCalls.set(callId, call);

    // Send INVITE
    this.sendRaw(inviteMessage, destDomain, destPort);
    console.log(`[SIPServer] INVITE sent, Call-ID: ${callId}`);

    return callId;
  }

  /**
   * Handle INVITE response (100 Trying, 180 Ringing, 200 OK, 407 Auth, etc.)
   */
  private async handleInviteResponse(
    message: string,
    remoteAddress: string,
    remotePort: number
  ): Promise<void> {
    const callId = this.extractHeader(message, 'Call-ID');
    const call = this.activeCalls.get(callId);

    if (!call || call.direction !== 'outbound') {
      console.warn(`[SIPServer] INVITE response for unknown outbound call: ${callId}`);
      return;
    }

    const statusMatch = message.match(/^SIP\/2\.0\s+(\d+)\s+(.+)$/m);
    if (!statusMatch) {
      console.warn('[SIPServer] Invalid SIP response format');
      return;
    }

    const statusCode = parseInt(statusMatch[1]);
    const statusText = statusMatch[2];

    console.log(`[SIPServer] INVITE response: ${statusCode} ${statusText}`);

    if (statusCode === 100) {
      // 100 Trying - do nothing, just wait
    } else if (statusCode === 407) {
      // 407 Proxy Authentication Required - retry with auth
      console.log(`[SIPServer] INVITE requires proxy authentication, retrying...`);
      await this.retryInviteWithAuth(message, call);
    } else if (statusCode === 180 || statusCode === 183) {
      // 180 Ringing or 183 Session Progress
      call.state = 'ringing';
      console.log(`[SIPServer] Call ringing: ${callId}`);
      this.emit('callRinging', { callId });
    } else if (statusCode === 200) {
      // 200 OK - Call answered
      call.state = 'established';

      // Parse SDP from response
      const sdpStart = message.indexOf('\r\n\r\n') + 4;
      const sdpBody = message.substring(sdpStart);

      // Parse remote RTP port and IP from SDP
      const audioMatch = sdpBody.match(/m=audio\s+(\d+)/);
      const remoteRTPPort = audioMatch ? parseInt(audioMatch[1]) : 0;

      const connectionMatch = sdpBody.match(/c=IN IP4 ([\d.]+)/);
      const remoteRTPAddress = connectionMatch ? connectionMatch[1] : remoteAddress;

      // Determine codec from SDP answer
      const offersPCMA = /a=rtpmap:8\s+PCMA\/8000/i.test(sdpBody);
      const selectedPayloadType = offersPCMA ? 8 : 0;

      console.log(
        `[SIPServer] Call answered, RTP: ${remoteRTPAddress}:${remoteRTPPort}, codec: ${selectedPayloadType === 8 ? 'PCMA' : 'PCMU'}`
      );

      // Update RTP handler with remote endpoint
      call.rtpHandler.setRemoteEndpoint(remoteRTPAddress, remoteRTPPort);
      call.rtpHandler.setPayloadType(selectedPayloadType);

      // Extract To tag for dialog tracking
      const to = this.extractHeader(message, 'To');
      const cseq = this.extractHeader(message, 'CSeq');
      const cseqNum = cseq.match(/^(\d+)/)?.[1] || '1';

      const ackMessage =
        `ACK ${call.to.match(/<(.+)>/)?.[1] || call.to} SIP/2.0\r\n` +
        `Via: SIP/2.0/UDP ${this.localIP}:${this.sipPort};branch=z9hG4bK${Math.random().toString(36).substring(2)}\r\n` +
        `From: ${call.from}\r\n` +
        `To: ${to}\r\n` +
        `Call-ID: ${callId}\r\n` +
        `CSeq: ${cseqNum} ACK\r\n` +
        `Max-Forwards: 70\r\n` +
        `Content-Length: 0\r\n\r\n`;

      this.sendRaw(ackMessage, call.remoteAddress, call.remotePort);
      console.log(`[SIPServer] ACK sent, call established: ${callId}`);

      // Emit call started event
      this.emit('callStarted', { callId, rtpHandler: call.rtpHandler });
    } else if (statusCode >= 400) {
      // Error response
      console.error(`[SIPServer] Call failed: ${statusCode} ${statusText}`);
      call.state = 'terminated';
      const rtpPort = call.rtpHandler.getLocalPort();
      await call.rtpHandler.stop();
      this.freeRTPPort(rtpPort);
      this.activeCalls.delete(callId);
      this.emit('callFailed', { callId, statusCode, statusText });
    }
  }

  /**
   * Send BYE to terminate an active call
   */
  async terminateCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.warn(`[SIPServer] Cannot terminate unknown call: ${callId}`);
      return;
    }

    const cseq = call.direction === 'outbound' ? 2 : 1;
    const branch = `z9hG4bK${Math.random().toString(36).substring(2)}`;

    const byeMessage =
      `BYE ${call.to.match(/<(.+)>/)?.[1] || call.to} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.localIP}:${this.sipPort};branch=${branch}\r\n` +
      `From: ${call.from}\r\n` +
      `To: ${call.to}\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: ${cseq} BYE\r\n` +
      `Max-Forwards: 70\r\n` +
      `Content-Length: 0\r\n\r\n`;

    this.sendRaw(byeMessage, call.remoteAddress, call.remotePort);
    console.log(`[SIPServer] BYE sent for ${callId}`);

    call.state = 'terminated';
    const rtpPort = call.rtpHandler.getLocalPort();
    await call.rtpHandler.stop();
    this.freeRTPPort(rtpPort);
    this.activeCalls.delete(callId);
    this.emit('callEnded', { callId });
  }

  /**
   * Retry INVITE with Proxy Authentication
   */
  private async retryInviteWithAuth(response: string, call: SIPCall): Promise<void> {
    // Extract Proxy-Authenticate header
    const proxyAuth = this.extractHeader(response, 'Proxy-Authenticate');
    const realm = this.extractParameter(proxyAuth, 'realm');
    const nonce = this.extractParameter(proxyAuth, 'nonce');

    if (!realm || !nonce) {
      console.error(`[SIPServer] Missing realm or nonce in Proxy-Authenticate`);
      return;
    }

    // Extract original To URI
    const toUriMatch = call.to.match(/<(.+)>/);
    const toUri = toUriMatch ? toUriMatch[1] : call.to;

    // Calculate digest response
    const response_digest = this.calculateDigestResponse('INVITE', toUri, realm, nonce);

    // Create authorization header
    const authHeader =
      `Digest username="${this.username}", ` +
      `realm="${realm}", ` +
      `nonce="${nonce}", ` +
      `uri="${toUri}", ` +
      `response="${response_digest}", ` +
      `algorithm=MD5`;

    // Create new branch for retry
    const branch = `z9hG4bK${Math.random().toString(36).substring(2)}`;
    const contactIP = this.advertisedIP || this.localIP;

    // Get SDP from RTP handler
    const sdp = this.createSDP(call.rtpHandler.getLocalPort(), contactIP, 0);

    // Create authenticated INVITE
    const inviteMessage =
      `INVITE ${toUri} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${this.localIP}:${this.sipPort};branch=${branch}\r\n` +
      `From: ${call.from}\r\n` +
      `To: ${call.to}\r\n` +
      `Call-ID: ${call.callId}\r\n` +
      `CSeq: 2 INVITE\r\n` +
      `Contact: <sip:${this.username}@${contactIP}:${this.sipPort}>\r\n` +
      `Proxy-Authorization: ${authHeader}\r\n` +
      `Max-Forwards: 70\r\n` +
      `User-Agent: VoiceAgent/1.0\r\n` +
      `Content-Type: application/sdp\r\n` +
      `Content-Length: ${sdp.length}\r\n` +
      `\r\n` +
      sdp;

    this.sendRaw(inviteMessage, call.remoteAddress, call.remotePort);
    console.log(`[SIPServer] Authenticated INVITE sent`);
  }

  /**
   * Get call state
   */
  getCallState(callId: string): string | null {
    return this.activeCalls.get(callId)?.state || null;
  }

  async stop(): Promise<void> {
    console.log('[SIPServer] Stopping...');

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

    console.log('[SIPServer] Stopped');
  }
}
