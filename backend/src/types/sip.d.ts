declare module 'sip' {
  export interface SIPRequest {
    method: string;
    uri: string;
    headers: {
      [key: string]: any;
      'call-id': string;
      from?: { uri: string };
      to?: { uri: string };
      'content-type'?: string;
    };
    content?: string;
  }

  export interface SIPResponse {
    status: number;
    reason: string;
    headers: {
      [key: string]: any;
      'content-type'?: string;
    };
    content?: string;
  }

  export interface SIPOptions {
    port?: number;
    publicAddress?: string;
  }

  export function start(
    options: SIPOptions,
    handler: (request: SIPRequest) => void
  ): void;

  export function stop(): void;

  export function send(response: SIPResponse): void;

  export function makeResponse(
    request: SIPRequest,
    status: number,
    reason: string
  ): SIPResponse;
}
