import { BaseLink, createWireCodec } from '@sms/shared';
import type { WebSocket } from 'ws';

/** Adapts a `ws` WebSocket to the shared Link interface. */
export class WsLink extends BaseLink {
  /** Per-link wire state (protocol v5): binary delta snapshots, JSON for everything else. */
  private readonly codec = createWireCodec();

  constructor(
    id: string,
    private readonly ws: WebSocket,
  ) {
    super(id);
    ws.on('message', (data, isBinary) =>
      this.deliver(this.codec.decode(isBinary ? toBytes(data) : data.toString())),
    );
    ws.on('close', () => this.markClosed());
    ws.on('error', () => this.markClosed());
  }

  send(msg: unknown): void {
    if (this.open && this.ws.readyState === this.ws.OPEN) this.ws.send(this.codec.encode(msg));
  }

  protected doClose(): void {
    this.ws.close();
  }
}

function toBytes(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}
