declare module 'node-ulaw' {
  export function encodeUlaw(input: Buffer): Buffer;
  export function decodeUlaw(input: Buffer): Buffer;
}
