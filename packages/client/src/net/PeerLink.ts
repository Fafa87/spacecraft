import type { DataConnection } from 'peerjs';
import { BaseLink, createWireCodec, type WireCodec } from '@sms/shared';

/**
 * Link over a PeerJS (WebRTC) DataConnection, reliable + ordered. Protocol v5 peers use
 * `serialization: 'raw'` with the per-link wire codec (binary delta snapshots); a peer that
 * connected with PeerJS JSON serialization (pre-v5 builds) gets plain objects, enough for
 * the version handshake to tell it to refresh.
 */
export class PeerLink extends BaseLink {
  private readonly codec: WireCodec | null;

  constructor(private readonly conn: DataConnection) {
    super(conn.connectionId ?? conn.peer);
    this.codec = conn.serialization === 'raw' ? createWireCodec() : null;
    conn.on('data', (d) => {
      try {
        this.deliver(this.codec ? this.codec.decode(d) : d);
      } catch {
        /* ignore malformed */
      }
    });
    conn.on('close', () => this.markClosed());
    conn.on('error', () => this.markClosed());
    // Watch the underlying RTCPeerConnection: PeerJS does not always emit 'close' on network loss.
    const pc = conn.peerConnection as RTCPeerConnection | undefined;
    pc?.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.markClosed();
    });
  }

  send(msg: unknown): void {
    if (this.open && this.conn.open) this.conn.send(this.codec ? this.codec.encode(msg) : msg);
  }

  protected doClose(): void {
    this.conn.close();
  }
}
