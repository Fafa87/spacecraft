import type { RunResult, SubmitResponse, TopResponse } from '@sms/shared';
import type { HighscoreStore, SubmitOutcome, TopResult } from './HighscoreStore.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Talks to the @sms/server highscore API. Throws on network / server errors. */
export class HttpHighscoreStore implements HighscoreStore {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 4000,
  ) {}

  async submit(result: RunResult): Promise<SubmitOutcome> {
    const res = await fetch(`${this.baseUrl}/api/highscores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new HttpError(res.status, `submit failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as SubmitResponse;
    return { status: 'server', rank: body.rank };
  }

  async top(teamSize: number, limit = 10): Promise<TopResult> {
    const res = await fetch(`${this.baseUrl}/api/highscores/${teamSize}?limit=${limit}`, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new HttpError(res.status, `top failed: ${res.status}`);
    const body = (await res.json()) as TopResponse;
    return { entries: body.entries, source: 'server' };
  }
}
