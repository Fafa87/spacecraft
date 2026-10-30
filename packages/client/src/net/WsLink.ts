import { BaseLink, codec } from '@sms/shared';

/** Browser WebSocket link to the (experimental) dedicated host. */
export class BrowserWsLink extends BaseLink {
  constructor(private readonly ws: WebSocket) {
    super('ws');
    ws.addEventListener('message', (ev) => {
      try {
        this.deliver(codec.decode(ev.data));
      } catch {
        /* ignore malformed */
      }
    });
    ws.addEventListener('close', () => this.markClosed());
    ws.addEventListener('error', () => this.markClosed());
  }

  send(msg: unknown): void {
    if (this.open && this.ws.readyState === WebSocket.OPEN) this.ws.send(codec.encode(msg));
  }

  protected doClose(): void {
    this.ws.close();
  }
}
