import { BaseLink, createWireCodec } from '@sms/shared';

/** Browser WebSocket link to the (experimental) dedicated host. */
export class BrowserWsLink extends BaseLink {
  /** Per-link wire state (protocol v5: binary delta snapshots). */
  private readonly codec = createWireCodec();

  constructor(private readonly ws: WebSocket) {
    super('ws');
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', (ev) => {
      try {
        this.deliver(this.codec.decode(ev.data));
      } catch {
        /* ignore malformed */
      }
    });
    ws.addEventListener('close', () => this.markClosed());
    ws.addEventListener('error', () => this.markClosed());
  }

  send(msg: unknown): void {
    if (this.open && this.ws.readyState === WebSocket.OPEN) this.ws.send(this.codec.encode(msg));
  }

  protected doClose(): void {
    this.ws.close();
  }
}
