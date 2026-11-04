import type { PeerOptions } from 'peerjs';
import { config, getServerInfo } from '../config.js';
import { forceRelay, iceServers } from '../net/ice.js';

/**
 * Same signalling + ICE (Metered TURN) setup as the game's Peer in net/connection.ts.
 * Deliberately a read-only copy so the prototype doesn't touch connection.ts.
 */
export async function voicePeerOptions(): Promise<PeerOptions> {
  const base: PeerOptions = {
    debug: config.debug ? 2 : 0,
    config: {
      iceServers: await iceServers(),
      sdpSemantics: 'unified-plan',
      ...(forceRelay() ? { iceTransportPolicy: 'relay' } : {}),
    } as RTCConfiguration,
  };
  if (config.peerOverride) return { ...base, ...config.peerOverride };
  const info = import.meta.env.DEV ? await getServerInfo() : null;
  if (info?.peer) {
    return {
      ...base,
      host: info.peer.host ?? location.hostname,
      port: info.peer.port,
      path: info.peer.path,
      secure: location.protocol === 'https:',
    };
  }
  return base;
}
