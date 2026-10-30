/**
 * Stateless JSON message encoding (protocol v4 wire format). Transports use the stateful
 * per-link `createWireCodec()` (wire.ts) since v5; this stays for tools and tests.
 */
export const codec = {
  encode(msg: unknown): string {
    return JSON.stringify(msg);
  },
  decode(data: unknown): unknown {
    if (typeof data !== 'string') {
      if (data instanceof ArrayBuffer) data = new TextDecoder().decode(data);
      else if (ArrayBuffer.isView(data)) data = new TextDecoder().decode(data as Uint8Array);
      else return data; // already an object (e.g. PeerJS json serialization)
    }
    try {
      return JSON.parse(data as string);
    } catch {
      return undefined;
    }
  },
};
