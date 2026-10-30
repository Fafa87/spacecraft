import type { RunResult, SubmitStatus } from '../highscore/types.js';
import type { PlayerInput } from '../sim/types.js';
import type { Snapshot } from '../sim/snapshot.js';

/**
 * Wire protocol between a game host (browser host, local, or dedicated server)
 * and clients. Transport-agnostic: see net/link.ts.
 */

export type SessionPhase = 'lobby' | 'playing' | 'over';

export interface LobbyPlayer {
  id: number;
  name: string;
  colorIndex: number;
}

export interface PlayerSummary {
  id: number;
  name: string;
  kills: number;
  damage: number;
  diedAtMs: number | null;
}

export type ClientMessage =
  | { t: 'join'; name: string; protocol: number }
  | { t: 'input'; i: PlayerInput }
  | { t: 'start' }
  | { t: 'toLobby' }
  | { t: 'ping'; ts: number };

export type HostMessage =
  | { t: 'welcome'; playerId: number; room: string; protocol: number }
  | {
      t: 'lobby';
      room: string;
      ownerId: number;
      phase: SessionPhase;
      maxPlayers: number;
      players: LobbyPlayer[];
    }
  | { t: 'start'; seed: number; players: LobbyPlayer[] }
  | { t: 'snap'; s: Snapshot }
  | { t: 'over'; result: RunResult; summary: PlayerSummary[] }
  | { t: 'submitted'; runId: string; status: SubmitStatus; rank?: number }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; ts: number };

export type ErrorCode =
  'full' | 'in_progress' | 'protocol' | 'not_owner' | 'bad_message' | 'closed';

const CLIENT_TYPES = new Set(['join', 'input', 'start', 'toLobby', 'ping']);

/** Cheap structural check for untrusted client messages. */
export function isClientMessage(m: unknown): m is ClientMessage {
  if (typeof m !== 'object' || m === null) return false;
  const t = (m as { t?: unknown }).t;
  if (typeof t !== 'string' || !CLIENT_TYPES.has(t)) return false;
  if (t === 'input') {
    const i = (m as { i?: Record<string, unknown> }).i;
    return (
      typeof i === 'object' &&
      i !== null &&
      typeof i.seq === 'number' &&
      typeof i.mx === 'number' &&
      typeof i.my === 'number' &&
      typeof i.aim === 'number' &&
      Number.isFinite(i.aim as number)
    );
  }
  if (t === 'join') return typeof (m as { name?: unknown }).name === 'string';
  return true;
}
