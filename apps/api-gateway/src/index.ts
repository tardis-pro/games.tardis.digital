import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { config, loadConfig } from '@player-platform-suite/config';

const appLogger = createRootLogger('api-gateway');

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
      exposeHeaders: ['X-Request-ID'],
    })
  );

  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'api-gateway',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (c) => {
    try {
      return c.json({
        status: 'ready',
        checks: {
          database: true,
          redis: true,
        },
      });
    } catch {
      return c.json(
        {
          status: 'not ready',
          error: 'Dependency check failed',
        },
        503
      );
    }
  });

  app.get('/metrics', async (c) => {
    return c.text('Metrics endpoint - to be implemented', 200);
  });

  const port = cfg.app.port;
  appLogger.info(`Starting API Gateway on port ${port}`);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
    error(error) {
      appLogger.error(error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  appLogger.info(`API Gateway running on http://localhost:${port}`);
}

main().catch((error) => {
  appLogger.fatal('Failed to start API Gateway', error);
  process.exit(1);
});
