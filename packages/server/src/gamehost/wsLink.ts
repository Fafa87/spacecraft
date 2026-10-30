import { BaseLink, codec } from '@sms/shared';
import type { WebSocket } from 'ws';

/** Adapts a `ws` WebSocket to the shared Link interface. */
export class WsLink extends BaseLink {
  constructor(
    id: string,
    private readonly ws: WebSocket,
  ) {
    super(id);
    ws.on('message', (data, isBinary) =>
      this.deliver(codec.decode(isBinary ? data : data.toString())),
    );
    ws.on('close', () => this.markClosed());
    ws.on('error', () => this.markClosed());
  }

  send(msg: unknown): void {
    if (this.open && this.ws.readyState === this.ws.OPEN) this.ws.send(codec.encode(msg));
  }

  protected doClose(): void {
    this.ws.close();
  }
}
