import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import {
  HostSession,
  makeRoomCode,
  normalizeRoomCode,
  type RunResult,
  type SubmitStatus,
} from '@sms/shared';
import { WsLink } from './wsLink.js';

export interface WsGameHostOptions {
  path?: string;
  submitResult: (r: RunResult) => Promise<{ status: SubmitStatus; rank?: number }>;
  log?: (...args: unknown[]) => void;
  maxRooms?: number;
}

/**
 * EXPERIMENTAL dedicated game host: runs the same HostSession as the browser
 * host, but server-side, over WebSockets. Connect to
 *   ws://host:port/ws?create=1         (new room, code returned in `welcome`)
 *   ws://host:port/ws?room=ABCDE       (join)
 * The P2P browser host is the default way to play; this exists so we can move
 * to trusted, server-authoritative runs (anti-cheat) later.
 */
export class WsGameHost {
  readonly rooms = new Map<string, HostSession>();
  private readonly wss = new WebSocketServer({ noServer: true });
  private linkSeq = 0;
  private readonly path: string;

  constructor(
    server: HttpServer,
    private readonly opts: WsGameHostOptions,
  ) {
    this.path = opts.path ?? '/ws';
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== this.path) return; // let other upgrade handlers (if any) deal with it
      const session = this.resolveRoom(url);
      if (!session) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        session.addLink(new WsLink(`ws${++this.linkSeq}`, ws));
      });
    });
  }

  private resolveRoom(url: URL): HostSession | null {
    if (url.searchParams.get('create')) {
      if (this.rooms.size >= (this.opts.maxRooms ?? 200)) return null;
      let code = makeRoomCode();
      while (this.rooms.has(code)) code = makeRoomCode();
      const session = new HostSession({
        roomCode: code,
        mode: 'dedicated',
        submitResult: this.opts.submitResult,
        log: this.opts.log,
        onEmpty: () => {
          session.close();
          this.rooms.delete(code);
        },
      });
      this.rooms.set(code, session);
      return session;
    }
    const code = normalizeRoomCode(url.searchParams.get('room') ?? '');
    return this.rooms.get(code) ?? null;
  }

  close(): void {
    for (const s of this.rooms.values()) s.close();
    this.rooms.clear();
    this.wss.close();
  }
}
