import { normalizeRoomCode } from '@sms/shared';

export interface JoinUrlOptions {
  /** e.g. `https://fafa87.github.io` (window.location.origin). */
  origin: string;
  /** Vite BASE_URL, e.g. `/spacecraft/` or `/`. */
  base: string;
  code: string;
  /** Dedicated WebSocket host room (adds ws=1). */
  dedicated?: boolean;
  /** Explicit highscore server override to pass along (only when the host used ?api=). */
  api?: string | null;
}

/** Normalizes a base path to `/x/y/` form ('' and './' become '/'). */
export function normalizeBase(base: string): string {
  let b = (base || '/').trim();
  if (b === './' || b === '.') b = '/';
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b += '/';
  return b.replace(/\/{2,}/g, '/');
}

/** The link (and QR payload) that drops a player straight into a squad room. */
export function buildJoinUrl(o: JoinUrlOptions): string {
  const origin = o.origin.replace(/\/+$/, '');
  const q = new URLSearchParams({ join: normalizeRoomCode(o.code) });
  if (o.dedicated) q.set('ws', '1');
  if (o.api) q.set('api', o.api);
  return `${origin}${normalizeBase(o.base)}?${q.toString()}`;
}

/** Extracts a normalized room code from a join URL's search string ('' if none). */
export function parseJoinCode(search: string): string {
  const raw = new URLSearchParams(search).get('join');
  return raw ? normalizeRoomCode(raw).slice(0, 8) : '';
}

/** Removes join-flow params from the address bar (so reload / back don't re-join). */
export function stripJoinParams(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('join');
  u.searchParams.delete('ws');
  const s = u.searchParams.toString();
  return `${u.pathname}${s ? `?${s}` : ''}${u.hash}`;
}
