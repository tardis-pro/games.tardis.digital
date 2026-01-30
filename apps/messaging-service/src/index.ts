import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import { NotFoundError, ValidationError } from '@player-platform-suite/errors';
import { MessageType } from '@player-platform-suite/shared-types';

const appLogger = createRootLogger('messaging-service');

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
      service: 'messaging-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/messages', async (c) => {
    const userId = c.get('userId');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const unreadOnly = c.req.query('unread') === 'true';

    const where: Record<string, unknown> = { recipientId: userId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    return c.json({
      success: true,
      data: {
        items: messages,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.get('/api/v1/messages/:messageId', async (c) => {
    const userId = c.get('userId');
    const messageId = c.req.param('messageId');

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        recipientId: userId,
      },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    return c.json({
      success: true,
      data: message,
    });
  });

  app.put('/api/v1/messages/:messageId/read', async (c) => {
    const userId = c.get('userId');
    const messageId = c.req.param('messageId');

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        recipientId: userId,
      },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    return c.json({
      success: true,
      data: updated,
    });
  });

  app.put('/api/v1/messages/read-all', async (c) => {
    const userId = c.get('userId');

    await prisma.message.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return c.json({
      success: true,
    });
  });

  app.post('/api/v1/messages', async (c) => {
    const body = await c.req.json<{
      recipientId: string;
      type: string;
      subject?: string;
      body: string;
      metadata?: Record<string, unknown>;
    }>();

    const message = await prisma.message.create({
      data: {
        recipientId: body.recipientId,
        type: body.type,
        subject: body.subject,
        body: body.body,
        metadata: body.metadata,
      },
    });

    return c.json({
      success: true,
      data: message,
    });
  });

  app.get('/api/v1/support/threads', async (c) => {
    const userId = c.get('userId');

    const threads = await prisma.supportThread.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
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

  app.post('/api/v1/support/threads', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<{
      subject: string;
      message: string;
      priority?: string;
    }>();

    const thread = await prisma.supportThread.create({
      data: {
        userId,
        subject: body.subject,
        priority: body.priority || 'normal',
        messages: {
          create: {
            senderId: userId,
            senderType: 'player',
            body: body.message,
          },
        },
      },
    });

    return c.json({
      success: true,
      data: thread,
    });
  });

  app.get('/api/v1/support/threads/:threadId', async (c) => {
    const userId = c.get('userId');
    const threadId = c.req.param('threadId');

    const thread = await prisma.supportThread.findFirst({
      where: {
        id: threadId,
        userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!thread) {
      throw new NotFoundError('Support thread not found');
    }

    return c.json({
      success: true,
      data: thread,
    });
  });

  app.post('/api/v1/support/threads/:threadId/messages', async (c) => {
    const userId = c.get('userId');
    const threadId = c.req.param('threadId');
    const body = await c.req.json<{ message: string }>();

    const thread = await prisma.supportThread.findFirst({
      where: {
        id: threadId,
        userId,
      },
    });

    if (!thread) {
      throw new NotFoundError('Support thread not found');
    }

    const message = await prisma.supportMessage.create({
      data: {
        threadId,
        senderId: userId,
        senderType: 'player',
        body: body.message,
      },
    });

    await prisma.supportThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return c.json({
      success: true,
      data: message,
    });
  });

  const port = 4004;
  appLogger.info(`Starting Messaging Service on port ${port}`);

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
  appLogger.fatal('Failed to start Messaging Service', error);
  process.exit(1);
});
