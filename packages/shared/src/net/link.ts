/**
 * A Link is one bidirectional, ordered, reliable message channel between a
 * host and one client. Concrete links: local (in-memory), PeerJS DataConnection
 * (client package), WebSocket (server package / client package).
 */
export interface Link {
  readonly id: string;
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
  onClose(cb: () => void): void;
  close(): void;
  readonly open: boolean;
}

/** Base class handling listener bookkeeping; subclasses implement transmit/close. */
export abstract class BaseLink implements Link {
  private msgHandlers: Array<(m: unknown) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private closed = false;

  constructor(readonly id: string) {}

  get open(): boolean {
    return !this.closed;
  }

  abstract send(msg: unknown): void;
  protected abstract doClose(): void;

  onMessage(cb: (msg: unknown) => void): void {
    this.msgHandlers.push(cb);
  }

  onClose(cb: () => void): void {
    this.closeHandlers.push(cb);
  }

  protected deliver(msg: unknown): void {
    if (this.closed) return;
    for (const h of this.msgHandlers) h(msg);
  }

  /** Call when the underlying channel closed (either side). */
  protected markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const h of this.closeHandlers) h();
    this.msgHandlers = [];
    this.closeHandlers = [];
  }

  close(): void {
    if (this.closed) return;
    this.doClose();
    this.markClosed();
  }
}

class LocalLink extends BaseLink {
  peer?: LocalLink;

  send(msg: unknown): void {
    if (!this.open) return;
    const peer = this.peer;
    // Async delivery mimics a network and avoids re-entrancy surprises.
    queueMicrotask(() => peer?.receive(msg));
  }

  receive(msg: unknown): void {
    this.deliver(msg);
  }

  protected doClose(): void {
    const peer = this.peer;
    queueMicrotask(() => peer?.remoteClosed());
  }

  remoteClosed(): void {
    this.markClosed();
  }
}

/** In-memory link pair: [hostSide, clientSide]. Used for solo play and the host's own marine. */
export function createLocalLinkPair(id = 'local'): [Link, Link] {
  const a = new LocalLink(id);
  const b = new LocalLink(id);
  a.peer = b;
  b.peer = a;
  return [a, b];
}
