import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import Redis from 'ioredis';

const appLogger = createRootLogger('leaderboard-service');

interface RedisClient {
  zadd: (...args: unknown[]) => Promise<number>;
  zrevrange: (...args: unknown[]) => Promise<string[]>;
  zscore: (...args: unknown[]) => Promise<string | null>;
  zrevrank: (...args: unknown[]) => Promise<number | null>;
  zrem: (...args: unknown[]) => Promise<number>;
  pipeline: () => {
    zadd: (...args: unknown[]) => unknown;
    zrevrange: (...args: unknown[]) => unknown;
    zscore: (...args: unknown[]) => unknown;
    zrevrank: (...args: unknown[]) => unknown;
    zrem: (...args: unknown[]) => unknown;
    exec: () => Promise<[unknown, unknown][]>;
  };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = new Hono();

  const redis = new Redis(cfg.redis.url);
  const keyPrefix = cfg.redis.keyPrefix;

  app.use(requestId());
  app.use(logger());
  app.use(
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'leaderboard-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/leaderboards', async (c) => {
    const seasons = await prisma.leaderboardSeason.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return c.json({
      success: true,
      data: seasons,
    });
  });

  app.post('/api/v1/leaderboards', async (c) => {
    const body = await c.req.json<{
      name: string;
      description?: string;
      type: 'global' | 'regional' | 'friends';
      startsAt: string;
      endsAt: string;
    }>();

    const season = await prisma.leaderboardSeason.create({
      data: {
        name: body.name,
        description: body.description,
        type: body.type,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      },
    });

    return c.json({
      success: true,
      data: season,
    });
  });

  app.get('/api/v1/leaderboards/:seasonId/top', async (c) => {
    const seasonId = c.req.param('seasonId');
    const limit = parseInt(c.req.query('limit') || '10', 10);

    const key = `${keyPrefix}leaderboard:${seasonId}:global`;
    const scores = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    const entries = [];
    for (let i = 0; i < scores.length; i += 2) {
      entries.push({
        rank: Math.floor(i / 2) + 1,
        userId: scores[i],
        score: parseInt(scores[i + 1], 10),
      });
    }

    return c.json({
      success: true,
      data: entries,
    });
  });

  app.get('/api/v1/leaderboards/:seasonId/rank/:userId', async (c) => {
    const seasonId = c.req.param('seasonId');
    const userId = c.req.param('userId');

    const key = `${keyPrefix}leaderboard:${seasonId}:global`;
    const rank = await redis.zrevrank(key, userId);
    const score = await redis.zscore(key, userId);

    if (rank === null) {
      return c.json({
        success: true,
        data: {
          rank: null,
          score: null,
        },
      });
    }

    return c.json({
      success: true,
      data: {
        rank: rank + 1,
        score: parseInt(score || '0', 10),
      },
    });
  });

  app.post('/api/v1/leaderboards/:seasonId/score', async (c) => {
    const seasonId = c.req.param('seasonId');
    const body = await c.req.json<{
      userId: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>();

    const key = `${keyPrefix}leaderboard:${seasonId}:global`;
    const pipeline = redis.pipeline();

    pipeline.zadd(key, body.score, body.userId);

    if (body.metadata) {
      pipeline.hset(`${keyPrefix}leaderboard:meta:${seasonId}`, body.userId, JSON.stringify(body.metadata));
    }

    pipeline.zrevrank(key, body.userId);
    pipeline.zscore(key, body.userId);

    const results = await pipeline.exec();

    return c.json({
      success: true,
      data: {
        rank: (results?.[2]?.[1] as number) + 1 || null,
        score: (results?.[3]?.[1] as string) ? parseInt(results[3][1] as string, 10) : null,
      },
    });
  });

  app.delete('/api/v1/leaderboards/:seasonId/entries/:userId', async (c) => {
    const seasonId = c.req.param('seasonId');
    const userId = c.req.param('userId');

    const key = `${keyPrefix}leaderboard:${seasonId}:global`;
    await redis.zrem(key, userId);

    await prisma.leaderboardEntry.deleteMany({
      where: {
        seasonId,
        userId,
      },
    });

    return c.json({
      success: true,
    });
  });

  const port = 4003;
  appLogger.info(`Starting Leaderboard Service on port ${port}`);

  Bun.serve({
    port,
    fetch: app.fetch,
    error(error) {
      appLogger.error(error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });
}

main().catch((error) => {
  appLogger.fatal('Failed to start Leaderboard Service', error);
  process.exit(1);
});
