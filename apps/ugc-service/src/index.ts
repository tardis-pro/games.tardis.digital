import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import { NotFoundError, ValidationError, BadRequestError } from '@player-platform-suite/errors';
import { randomUUID } from 'crypto';

const appLogger = createRootLogger('ugc-service');

const ALLOWED_TYPES = ['mod', 'image', 'video', 'map', 'text'];
const MAX_FILE_SIZE: Record<string, number> = {
  mod: 100 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  map: 50 * 1024 * 1024,
  text: 1 * 1024 * 1024,
};

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = new Hono();

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
      service: 'ugc-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/v1/ugc/upload', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<{
      type: string;
      name: string;
      filename: string;
      contentType: string;
      size: number;
      checksum: string;
      description?: string;
      tags?: string[];
    }>();

    if (!ALLOWED_TYPES.includes(body.type)) {
      throw new ValidationError(`Invalid UGC type: ${body.type}`);
    }

    if (body.size > MAX_FILE_SIZE[body.type]) {
      throw new ValidationError('File too large');
    }

    const ugcId = randomUUID();
    const storagePath = `ugc/${body.type}/${ugcId}/${body.filename}`;

    const uploadUrl = `https://${cfg.storage.bucket}.${cfg.storage.endpoint}/${storagePath}?presigned=true`;

    await prisma.uGCItem.create({
      data: {
        id: ugcId,
        creatorId: userId,
        type: body.type,
        name: body.name,
        description: body.description,
        tags: body.tags || [],
        status: 'draft',
        visibility: 'public',
        storagePath,
        checksum: body.checksum,
        fileSize: BigInt(body.size),
        contentType: body.contentType,
      },
    });

    return c.json({
      success: true,
      data: {
        ugcId,
        uploadUrl,
        expiresIn: 3600,
        storagePath,
      },
    });
  });

  app.post('/api/v1/ugc/:ugcId/publish', async (c) => {
    const userId = c.get('userId');
    const ugcId = c.req.param('ugcId');
    const body = await c.req.json<{ checksum: string }>();

    const ugc = await prisma.uGCItem.findFirst({
      where: {
        id: ugcId,
        creatorId: userId,
      },
    });

    if (!ugc) {
      throw new NotFoundError('UGC not found');
    }

    if (ugc.status !== 'draft') {
      throw new BadRequestError('UGC already published or in progress');
    }

    if (ugc.checksum !== body.checksum) {
      throw new BadRequestError('Checksum mismatch');
    }

    await prisma.uGCItem.update({
      where: { id: ugcId },
      data: {
        status: 'scanning',
        updatedAt: new Date(),
      },
    });

    return c.json({
      success: true,
      data: {
        ugcId,
        status: 'scanning',
      },
    });
  });

  app.get('/api/v1/ugc', async (c) => {
    const userId = c.get('userId');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const [items, total] = await Promise.all([
      prisma.uGCItem.findMany({
        where: {
          creatorId: userId,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.uGCItem.count({ where: { creatorId: userId } }),
    ]);

    return c.json({
      success: true,
      data: {
        items,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.get('/api/v1/ugc/discovery', async (c) => {
    const type = c.req.query('type');
    const sort = c.req.query('sort') || 'newest';
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const search = c.req.query('search');

    const where: Record<string, unknown> = {
      status: 'published',
      visibility: 'public',
    };

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: Record<string, string> = { createdAt: 'desc' };

    switch (sort) {
      case 'trending':
        orderBy = { downloadCount: 'desc' };
        break;
      case 'top_rated':
        orderBy = [{ ratingSum: 'desc' }, { ratingCount: 'desc' }] as unknown as Record<string, string>;
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [items, total] = await Promise.all([
      prisma.uGCItem.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.uGCItem.count({ where }),
    ]);

    return c.json({
      success: true,
      data: {
        items,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.get('/api/v1/ugc/:ugcId', async (c) => {
    const ugcId = c.req.param('ugcId');

    const ugc = await prisma.uGCItem.findUnique({
      where: { id: ugcId },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!ugc) {
      throw new NotFoundError('UGC not found');
    }

    return c.json({
      success: true,
      data: ugc,
    });
  });

  app.post('/api/v1/ugc/:ugcId/rate', async (c) => {
    const userId = c.get('userId');
    const ugcId = c.req.param('ugcId');
    const body = await c.req.json<{ rating: number }>();

    if (body.rating < 1 || body.rating > 5) {
      throw new ValidationError('Rating must be between 1 and 5');
    }

    const ugc = await prisma.uGCItem.findUnique({
      where: { id: ugcId },
    });

    if (!ugc) {
      throw new NotFoundError('UGC not found');
    }

    await prisma.uGCItemRating.upsert({
      where: {
        ugcId_userId: {
          ugcId,
          userId,
        },
      },
      create: {
        ugcId,
        userId,
        rating: body.rating,
      },
      update: {
        rating: body.rating,
      },
    });

    const aggregate = await prisma.uGCItemRating.aggregate({
      where: { ugcId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.uGCItem.update({
      where: { id: ugcId },
      data: {
        ratingSum: aggregate._avg.rating
          ? Math.round(aggregate._avg.rating * aggregate._count.rating)
          : 0,
        ratingCount: aggregate._count.rating,
      },
    });

    return c.json({
      success: true,
    });
  });

  app.post('/api/v1/ugc/:ugcId/report', async (c) => {
    const userId = c.get('userId');
    const ugcId = c.req.param('ugcId');
    const body = await c.req.json<{
      reason: string;
      description?: string;
    }>();

    const ugc = await prisma.uGCItem.findUnique({
      where: { id: ugcId },
    });

    if (!ugc) {
      throw new NotFoundError('UGC not found');
    }

    if (ugc.creatorId === userId) {
      throw new ValidationError('Cannot report your own content');
    }

    await prisma.uGCReport.create({
      data: {
        ugcId,
        reporterId: userId,
        reason: body.reason,
        description: body.description,
      },
    });

    return c.json({
      success: true,
    });
  });

  const port = 4006;
  appLogger.info(`Starting UGC Service on port ${port}`);

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
  appLogger.fatal('Failed to start UGC Service', error);
  process.exit(1);
});
