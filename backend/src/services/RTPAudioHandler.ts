import dgram from 'dgram';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { encodeUlaw as encodePCMU, decodeUlaw as decodePCMU } from 'node-ulaw';

/**
 * RTP Audio Handler
 * Manages RTP streams for receiving and sending audio data
 */
export class RTPAudioHandler extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private remoteAddress: string | null = null;
  private remotePort: number | null = null;
  private localPort: number;
  private ssrc: number;
  private sequenceNumber: number = 0;
  private timestamp: number = 0;
  private markerNext: boolean = true;
  private payloadType: number = 0; // 0=PCMU, 8=PCMA
  private sentPackets: number = 0;
  private receivedPackets: number = 0;

  constructor(localPort: number) {
    super();
    this.localPort = localPort;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
  }

  setPayloadType(pt: number) {
    this.payloadType = pt;
  }

  getLocalPort(): number {
    return this.localPort;
  }

  /**
   * Start listening for RTP packets
   */
  async start(): Promise<void> {
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg, rinfo) => {
      // Update remote address when we receive packets (for NAT traversal)
      if (!this.remoteAddress || this.remoteAddress !== rinfo.address || this.remotePort !== rinfo.port) {
        this.remoteAddress = rinfo.address;
        this.remotePort = rinfo.port;
        logger.info({ remoteAddress: this.remoteAddress, remotePort: this.remotePort }, 'RTP remote endpoint detected/updated');
      }

      // Parse and emit audio data
      const audioData = this.parseRTPPacket(msg);
      if (audioData) {
        this.receivedPackets += 1;
        if (this.receivedPackets === 1) {
          logger.info({ size: msg.length }, 'First RTP packet received');
        }
        if (this.receivedPackets % 100 === 0) {
          logger.debug({ receivedPackets: this.receivedPackets }, 'RTP packets received');
        }
        this.emit('audio', audioData);
      }
    });

    this.socket.on('error', (error) => {
      logger.error({ error }, 'RTP socket error');
      this.emit('error', error);
    });

    return new Promise((resolve, reject) => {
      this.socket!.bind(this.localPort, () => {
        logger.info({ port: this.localPort }, 'RTP socket listening');
        resolve();
      });

      this.socket!.on('error', reject);
    });
  }

  /**
   * Set remote RTP endpoint (for NAT traversal - send before receiving)
   */
  setRemoteEndpoint(address: string, port: number): void {
    this.remoteAddress = address;
    this.remotePort = port;
    logger.info({ remoteAddress: address, remotePort: port }, 'RTP remote endpoint set from SDP');
  }

  /**
   * Send audio data via RTP
   * Expects 16-bit PCM audio, which will be encoded to PCMU (G.711 μ-law)
   */
  sendAudio(pcmData: Buffer): void {
    if (!this.socket || !this.remoteAddress || !this.remotePort) {
      logger.warn('Cannot send audio: RTP not connected');
      return;
    }

    const encoded = this.payloadType === 8 ? this.encodePCMA(pcmData) : encodePCMU(pcmData);

    // Create RTP packet with selected payload type
    const rtpPacket = this.createRTPPacket(encoded, this.markerNext, this.payloadType);
    this.markerNext = false;

    this.socket.send(rtpPacket, this.remotePort, this.remoteAddress, (error) => {
      if (error) {
        logger.error({ error }, 'Failed to send RTP packet');
      }
    });

    // Update sequence and timestamp
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xFFFF;
    // For 8kHz G.711, timestamp increments by number of samples (pcmData.length / 2 for 16-bit)
    this.timestamp = (this.timestamp + (pcmData.length / 2)) & 0xFFFFFFFF;
    this.sentPackets += 1;
    if (this.sentPackets === 1) {
      logger.info({ bytes: pcmData.length }, 'First RTP packet sent');
    }
    if (this.sentPackets % 100 === 0) {
      logger.debug({ sentPackets: this.sentPackets }, 'RTP packets sent');
    }
  }

  /**
   * Stop RTP handler
   */
  async stop(): Promise<void> {
    if (this.socket) {
      return new Promise<void>((resolve) => {
        this.socket!.close(() => {
          logger.info('RTP socket closed');
          this.socket = null;
          resolve();
        });
      });
    }
  }

  /**
   * Get local RTP port
   */
  getLocalPort(): number {
    return this.localPort;
  }

  /**
   * Send a short burst of silence to open RTP path (helps SBCs/NAT)
   */
  async sendSilence(durationMs: number): Promise<void> {
    const chunkMs = 20;
    const samplesPerChunk = (8000 * chunkMs) / 1000;
    const pcmSilence = Buffer.alloc(samplesPerChunk * 2); // 16-bit PCM zeros

    const chunks = Math.ceil(durationMs / chunkMs);
    this.setMarkerForNextPacket();

    for (let i = 0; i < chunks; i++) {
      this.sendAudio(pcmSilence);
      await new Promise((resolve) => setTimeout(resolve, chunkMs));
    }
  }

  /**
   * Parse RTP packet and extract audio payload
   * Decodes PCMU (G.711 μ-law) to 16-bit PCM
   */
  private parseRTPPacket(packet: Buffer): Buffer | null {
    if (packet.length < 12) {
      return null;
    }

    // RTP header is 12 bytes minimum
    const headerLength = 12;

    const payloadType = packet[1] & 0x7f;

    // Extract PCMU payload (skip RTP header)
    const payload = packet.slice(headerLength);

    // Decode based on payload type
    let pcmPayload: Buffer;
    if (payloadType === 8) {
      pcmPayload = this.decodePCMA(payload);
    } else {
      pcmPayload = decodePCMU(payload);
    }

    return pcmPayload;
  }

  /**
   * Create RTP packet from PCM data
   */
  private createRTPPacket(pcmData: Buffer, marker: boolean, payloadType: number): Buffer {
    const header = Buffer.alloc(12);

    // Version (2), Padding (0), Extension (0), CSRC count (0)
    header[0] = 0x80;

    // Marker (bit 7), Payload type (7 bits)
    header[1] = (marker ? 0x80 : 0x00) | (payloadType & 0x7f);

    // Sequence number
    header.writeUInt16BE(this.sequenceNumber, 2);

    // Timestamp
    header.writeUInt32BE(this.timestamp, 4);

    // SSRC
    header.writeUInt32BE(this.ssrc, 8);

    // Combine header and payload
    return Buffer.concat([header, pcmData]);
  }

  /**
   * Set marker bit on next packet (start of new talkspurt)
   */
  setMarkerForNextPacket(): void {
    this.markerNext = true;
  }

  /**
   * Convert PCM 16-bit signed little endian to G.711 A-law
   */
  private linearToALawSample(sample: number): number {
    const CLIP = 32635;
    const sign = sample < 0 ? 0x80 : 0x00;
    if (sample < 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;

    let compressed = 0;
    if (sample >= 256) {
      let exponent = 7;
      for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
        exponent--;
      }
      const mantissa = (sample >> (exponent + 3)) & 0x0F;
      compressed = (exponent << 4) | mantissa;
    } else {
      compressed = sample >> 4;
    }

    compressed ^= 0x55;
    compressed |= sign;
    return compressed & 0xFF;
  }

  private aLawToLinearSample(aVal: number): number {
    aVal ^= 0x55;
    let t = (aVal & 0x0F) << 4;
    let segment = (aVal & 0x70) >> 4;
    switch (segment) {
      case 0:
        t += 8;
        break;
      case 1:
        t += 0x108;
        break;
      default:
        t += 0x108;
        t <<= segment - 1;
    }
    return (aVal & 0x80) ? t : -t;
  }

  private encodePCMA(input: Buffer): Buffer {
    const out = Buffer.alloc(input.length / 2);
    for (let i = 0, o = 0; i < input.length; i += 2, o++) {
      const sample = input.readInt16LE(i);
      out[o] = this.linearToALawSample(sample);
    }
    return out;
  }

  private decodePCMA(input: Buffer): Buffer {
    const out = Buffer.alloc(input.length * 2);
    for (let i = 0, o = 0; i < input.length; i++, o += 2) {
      const sample = this.aLawToLinearSample(input[i]);
      out.writeInt16LE(sample, o);
    }
    return out;
  }
}
