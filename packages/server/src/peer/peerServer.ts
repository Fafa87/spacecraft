import { PeerServer } from 'peer';

/**
 * Optional bundled PeerJS signaling server. Players still connect P2P (WebRTC);
 * this only brokers the initial handshake so we don't depend on the public
 * 0.peerjs.com cloud during development.
 */
export function startPeerServer(port: number, path: string, log: (msg: string) => void): { close: () => void } {
  const server = PeerServer({ port, path, allow_discovery: false });
  log(`PeerJS signaling server on :${port}${path}`);
  return {
    close: () => {
      // peer's PeerServer returns an express app with a bound http server under `_server` in some versions.
      const s = (server as unknown as { _server?: { close: () => void } })._server;
      s?.close();
    },
  };
}
