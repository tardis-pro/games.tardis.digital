import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import { NotFoundError, ValidationError } from '@player-platform-suite/errors';

const appLogger = createRootLogger('admin-service');

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
      service: 'admin-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/admin/users', async (c) => {
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const search = c.req.query('search');

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { canonicalId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              entitlements: true,
              ugcItems: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return c.json({
      success: true,
      data: {
        items: users,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.get('/api/v1/admin/users/:userId', async (c) => {
    const userId = c.req.param('userId');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        identities: true,
        progressions: true,
        entitlements: {
          include: {
            sku: true,
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            ugcItems: true,
            messages: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return c.json({
      success: true,
      data: user,
    });
  });

  app.put('/api/v1/admin/users/:userId/roles', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json<{ roles: string[] }>();

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        roles: body.roles as ('PLAYER' | 'MODERATOR' | 'ADMIN')[],
      },
    });

    return c.json({
      success: true,
      data: user,
    });
  });

  app.get('/api/v1/admin/ugc/moderation-queue', async (c) => {
    const limit = parseInt(c.req.query('limit') || '50', 10);

    const items = await prisma.uGCItem.findMany({
      where: {
        status: { in: ['pending_review', 'flagged'] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    return c.json({
      success: true,
      data: items,
    });
  });

  app.put('/api/v1/admin/ugc/:ugcId/moderate', async (c) => {
    const moderatorId = c.get('userId');
    const ugcId = c.req.param('ugcId');
    const body = await c.req.json<{
      action: 'approve' | 'reject' | 'flag';
      reason?: string;
      notes?: string;
    }>();

    const ugc = await prisma.uGCItem.findUnique({
      where: { id: ugcId },
    });

    if (!ugc) {
      throw new NotFoundError('UGC not found');
    }

    let newStatus: 'published' | 'removed' | 'flagged';

    switch (body.action) {
      case 'approve':
        newStatus = 'published';
        break;
      case 'reject':
        newStatus = 'removed';
        break;
      case 'flag':
        newStatus = 'flagged';
        break;
      default:
        throw new ValidationError('Invalid moderation action');
    }

    await prisma.$transaction(async (tx) => {
      await tx.uGCItem.update({
        where: { id: ugcId },
        data: {
          status: newStatus,
          moderationNotes: body.notes,
          flaggedReason: body.reason,
          publishedAt: newStatus === 'published' ? new Date() : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: moderatorId,
          action: 'UPDATE',
          resourceType: 'ugc',
          resourceId: ugcId,
          newValue: {
            action: body.action,
            reason: body.reason,
            notes: body.notes,
          },
        },
      });
    });

    return c.json({
      success: true,
    });
  });

  app.get('/api/v1/admin/support/threads', async (c) => {
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '20', 10);

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const threads = await prisma.supportThread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return c.json({
      success: true,
      data: threads,
    });
  });

  app.post('/api/v1/admin/support/threads/:threadId/reply', async (c) => {
    const senderId = c.get('userId');
    const threadId = c.req.param('threadId');
    const body = await c.req.json<{ message: string }>();

    const thread = await prisma.supportThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundError('Support thread not found');
    }

    const message = await prisma.supportMessage.create({
      data: {
        threadId,
        senderId,
        senderType: 'support',
        body: body.message,
      },
    });

    await prisma.supportThread.update({
      where: { id: threadId },
      data: {
        status: 'pending',
        updatedAt: new Date(),
      },
    });

    return c.json({
      success: true,
      data: message,
    });
  });

  app.get('/api/v1/admin/orders', async (c) => {
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const status = c.req.query('status');

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
            },
          },
          items: {
            include: {
              sku: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where }),
    ]);

    return c.json({
      success: true,
      data: {
        items: orders,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.get('/api/v1/admin/audit-logs', async (c) => {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const resourceType = c.req.query('resourceType');

    const where: Record<string, unknown> = {};
    if (resourceType) {
      where.resourceType = resourceType;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return c.json({
      success: true,
      data: {
        items: logs,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.post('/api/v1/admin/broadcast', async (c) => {
    const body = await c.req.json<{
      subject: string;
      body: string;
    }>();

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    await prisma.message.createMany({
      data: users.map((user) => ({
        recipientId: user.id,
        type: 'CAMPAIGN_ANNOUNCEMENT',
        subject: body.subject,
        body: body.body,
      })),
    });

    return c.json({
      success: true,
      data: {
        recipients: users.length,
      },
    });
  });

  const port = 4007;
  appLogger.info(`Starting Admin Service on port ${port}`);

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
  appLogger.fatal('Failed to start Admin Service', error);
  process.exit(1);
});
