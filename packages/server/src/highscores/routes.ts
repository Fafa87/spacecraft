import type { FastifyInstance } from 'fastify';
import { clampLimit, HIGHSCORE_LIMITS, validateRunResult, type TopResponse } from '@sms/shared';
import { RateLimiter } from './rateLimiter.js';
import type { HighscoreRepository } from './repository.js';

export interface HighscoreRoutesOptions {
  repo: HighscoreRepository;
  submitRatePerMinute: number;
}

const parseTeamSize = (raw: unknown): number | null => {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(n) && n >= HIGHSCORE_LIMITS.minTeamSize && n <= HIGHSCORE_LIMITS.maxTeamSize ? n : null;
};

/**
 * Highscore REST API.
 *   GET  /api/highscores?limit=10               -> { tables: { "1": [...], ..., "4": [...] } }
 *   GET  /api/highscores?teamSize=2&limit=10    -> { teamSize, entries }
 *   GET  /api/highscores/:teamSize?limit=10     -> { teamSize, entries }
 *   POST /api/highscores  (RunResult JSON)      -> 201 { entry, rank, duplicate } | 200 if duplicate
 */
export async function highscoreRoutes(app: FastifyInstance, opts: HighscoreRoutesOptions): Promise<void> {
  const { repo } = opts;
  const limiter = new RateLimiter(opts.submitRatePerMinute);

  const topFor = async (teamSize: number, limit: number): Promise<TopResponse> => ({
    teamSize,
    entries: await repo.top(teamSize, limit),
  });

  app.get<{ Querystring: { teamSize?: string; limit?: string } }>('/api/highscores', async (req, reply) => {
    const limit = clampLimit(req.query.limit);
    if (req.query.teamSize !== undefined) {
      const ts = parseTeamSize(req.query.teamSize);
      if (ts === null) return reply.code(400).send({ error: 'invalid_team_size', message: 'teamSize must be 1-4' });
      return topFor(ts, limit);
    }
    const tables: Record<string, unknown> = {};
    for (let ts = HIGHSCORE_LIMITS.minTeamSize; ts <= HIGHSCORE_LIMITS.maxTeamSize; ts++) {
      tables[ts] = await repo.top(ts, limit);
    }
    return { tables };
  });

  app.get<{ Params: { teamSize: string }; Querystring: { limit?: string } }>('/api/highscores/:teamSize', async (req, reply) => {
    const ts = parseTeamSize(req.params.teamSize);
    if (ts === null) return reply.code(400).send({ error: 'invalid_team_size', message: 'teamSize must be 1-4' });
    return topFor(ts, clampLimit(req.query.limit));
  });

  app.post('/api/highscores', { bodyLimit: 4096 }, async (req, reply) => {
    if (!limiter.take(req.ip)) return reply.code(429).send({ error: 'rate_limited', message: 'Too many submissions' });
    const v = validateRunResult(req.body);
    if (!v.ok) return reply.code(400).send({ error: 'invalid_run', details: v.errors });
    const res = await repo.add(v.value);
    req.log.info({ runId: res.entry.runId, teamSize: res.entry.teamSize, survivalMs: res.entry.survivalMs, rank: res.rank }, 'highscore submitted');
    return reply.code(res.duplicate ? 200 : 201).send(res);
  });
}
