import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import { NotFoundError, ValidationError, ConflictError } from '@player-platform-suite/errors';
import Redis from 'ioredis';

const appLogger = createRootLogger('commerce-service');

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = new Hono();

  const redis = new Redis(cfg.redis.url);

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
      service: 'commerce-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/skus', async (c) => {
    const skus = await prisma.sKU.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({
      success: true,
      data: skus,
    });
  });

  app.get('/api/v1/skus/:skuId', async (c) => {
    const skuId = c.req.param('skuId');

    const sku = await prisma.sKU.findUnique({
      where: { id: skuId },
    });

    if (!sku) {
      throw new NotFoundError('SKU not found');
    }

    return c.json({
      success: true,
      data: sku,
    });
  });

  app.post('/api/v1/skus', async (c) => {
    const body = await c.req.json<{
      name: string;
      description?: string;
      type: string;
      category: string;
      price: number;
      currency?: string;
      metadata?: Record<string, unknown>;
    }>();

    const sku = await prisma.sKU.create({
      data: {
        name: body.name,
        description: body.description,
        type: body.type,
        category: body.category,
        price: body.price,
        currency: body.currency || 'USD',
        metadata: body.metadata,
      },
    });

    return c.json({
      success: true,
      data: sku,
    });
  });

  app.get('/api/v1/entitlements', async (c) => {
    const userId = c.get('userId');

    const entitlements = await prisma.entitlement.findMany({
      where: {
        userId,
        status: 'active',
      },
      include: {
        sku: true,
      },
      orderBy: { grantedAt: 'desc' },
    });

    return c.json({
      success: true,
      data: entitlements,
    });
  });

  app.post('/api/v1/entitlements/grant', async (c) => {
    const body = await c.req.json<{
      userId: string;
      skuId: string;
      orderId?: string;
      idempotencyKey: string;
    }>();

    const cached = await redis.get(`idempotency:${body.idempotencyKey}`);
    if (cached) {
      return c.json({
        success: true,
        data: JSON.parse(cached),
        cached: true,
      });
    }

    const existing = await prisma.entitlement.findFirst({
      where: {
        skuId: body.skuId,
        userId: body.userId,
        status: 'active',
      },
    });

    if (existing) {
      await redis.set(`idempotency:${body.idempotencyKey}`, JSON.stringify(existing), 'EX', 86400);
      return c.json({
        success: true,
        data: existing,
        cached: true,
      });
    }

    const entitlement = await prisma.$transaction(async (tx) => {
      let orderIdValue: string | undefined;

      if (body.orderId) {
        const order = await tx.order.create({
          data: {
            userId: body.userId,
            provider: 'STEAM',
            providerOrderId: body.orderId,
            status: 'verified',
            idempotencyKey: body.idempotencyKey,
            verifiedAt: new Date(),
          },
        });
        orderIdValue = order.id;
      }

      const entitlement = await tx.entitlement.create({
        data: {
          userId: body.userId,
          skuId: body.skuId,
          orderId: orderIdValue,
          status: 'active',
          grantedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          entitlementId: entitlement.id,
          userId: body.userId,
          skuId: body.skuId,
          changeType: 'grant',
          quantity: 1,
          balanceAfter: 1,
        },
      });

      return entitlement;
    });

    await redis.set(`idempotency:${body.idempotencyKey}`, JSON.stringify(entitlement), 'EX', 86400);

    return c.json({
      success: true,
      data: entitlement,
    });
  });

  app.get('/api/v1/orders', async (c) => {
    const userId = c.get('userId');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: {
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
      prisma.order.count({ where: { userId } }),
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

  const port = 4005;
  appLogger.info(`Starting Commerce Service on port ${port}`);

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
  appLogger.fatal('Failed to start Commerce Service', error);
  process.exit(1);
});
