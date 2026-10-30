import type { DataConnection } from 'peerjs';
import { BaseLink } from '@sms/shared';

/** Link over a PeerJS (WebRTC) DataConnection. JSON serialization, reliable+ordered. */
export class PeerLink extends BaseLink {
  constructor(private readonly conn: DataConnection) {
    super(conn.connectionId ?? conn.peer);
    conn.on('data', (d) => this.deliver(d));
    conn.on('close', () => this.markClosed());
    conn.on('error', () => this.markClosed());
    // Watch the underlying RTCPeerConnection: PeerJS does not always emit 'close' on network loss.
    const pc = conn.peerConnection as RTCPeerConnection | undefined;
    pc?.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.markClosed();
    });
  }

  send(msg: unknown): void {
    if (this.open && this.conn.open) this.conn.send(msg);
  }

  protected doClose(): void {
    this.conn.close();
  }
}
