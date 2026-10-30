import type { Server } from 'node:http';
import { PeerServer } from 'peer';

/**
 * Optional bundled PeerJS signaling server. Players still connect P2P (WebRTC);
 * this only brokers the initial handshake so we don't depend on the public
 * 0.peerjs.com cloud during development.
 */
export function startPeerServer(port: number, path: string, log: (msg: string) => void): { close: () => void } {
  let http: Server | null = null;
  let closed = false;
  PeerServer({ port, path, allow_discovery: false }, (server) => {
    http = server as Server;
    if (closed) http.close();
  });
  log(`PeerJS signaling server on :${port}${path}`);
  return {
    close: () => {
      closed = true;
      http?.closeAllConnections?.();
      http?.close();
    },
  };
}
