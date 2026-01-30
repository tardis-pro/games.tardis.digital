import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import { ValidationError, NotFoundError, ConflictError } from '@player-platform-suite/errors';

const appLogger = createRootLogger('progression-service');

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = new Hono();

  app.use(requestId());
  app.use(logger());
  app.use(
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'progression-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/progression/:userId', async (c) => {
    const userId = c.req.param('userId');

    const progression = await prisma.playerProgression.findUnique({
      where: { userId },
    });

    if (!progression) {
      throw new NotFoundError('Progression not found');
    }

    return c.json({
      success: true,
      data: progression,
    });
  });

  app.post('/api/v1/progression/:userId', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json<{
      displayName?: string;
      avatarUrl?: string;
      bio?: string;
      level?: number;
      xp?: number;
      achievements?: string[];
      currency?: Record<string, number>;
      metadata?: Record<string, unknown>;
      expectedVersion?: number;
    }>();

    const existing = await prisma.playerProgression.findUnique({
      where: { userId },
    });

    if (!existing) {
      const progression = await prisma.playerProgression.create({
        data: {
          userId,
          version: 1,
          displayName: body.displayName || `Player ${userId.slice(0, 8)}`,
          avatarUrl: body.avatarUrl,
          bio: body.bio,
          level: body.level || 1,
          xp: body.xp || 0,
          achievements: body.achievements || [],
          currency: body.currency || {},
          metadata: body.metadata || {},
        },
      });

      return c.json({
        success: true,
        data: progression,
      });
    }

    if (body.expectedVersion !== undefined && existing.version !== body.expectedVersion) {
      throw new ConflictError('Progression version mismatch. Refresh and retry.');
    }

    const progression = await prisma.playerProgression.update({
      where: { userId },
      data: {
        version: existing.version + 1,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
        bio: body.bio,
        level: body.level,
        xp: body.xp,
        achievements: body.achievements,
        currency: body.currency,
        metadata: body.metadata,
      },
    });

    return c.json({
      success: true,
      data: progression,
    });
  });

  app.get('/api/v1/progression/:userId/history', async (c) => {
    const userId = c.req.param('userId');
    const limit = parseInt(c.req.query('limit') || '10', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const progressions = await prisma.playerProgression.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return c.json({
      success: true,
      data: progressions,
    });
  });

  const port = 4002;
  appLogger.info(`Starting Progression Service on port ${port}`);

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
  appLogger.fatal('Failed to start Progression Service', error);
  process.exit(1);
});
