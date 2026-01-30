import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { createRootLogger } from '@player-platform-suite/logger';
import { config, loadConfig } from '@player-platform-suite/config';
import { prisma } from '@player-platform-suite/database';
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '@player-platform-suite/errors';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const appLogger = createRootLogger('auth-service');

const RATE_LIMIT_REQUESTS = 100;
const RATE_LIMIT_WINDOW = 60;

interface SteamTicketResponse {
  response: {
    authenticated: boolean;
    steamid?: string;
    personaname?: string;
    avatarfull?: string;
    error?: string;
  };
}

interface EpicTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
}

interface TokenPayload {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  providers: string[];
  roles: string[];
}

async function verifySteamTicket(ticket: string, steamId: string): Promise<SteamTicketResponse> {
  const response = await fetch(
    `${config.auth.steam.apiUrl}/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${config.auth.steam.apiKey}&ticket=${ticket}&appid=${config.auth.steam.appId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new BadRequestError('Failed to verify Steam ticket');
  }

  return response.json();
}

async function verifyEpicToken(epicToken: string): Promise<EpicTokenResponse> {
  const response = await fetch(`${config.auth.epic.apiUrl}/epic/oauth/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.auth.epic.clientId}:${config.auth.epic.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      token_type: 'epic',
    }),
  });

  if (!response.ok) {
    throw new BadRequestError('Failed to verify Epic token');
  }

  return response.json();
}

function generateAccessToken(user: {
  canonicalId: string;
  identities: { provider: string }[];
  roles: string[];
}): string {
  return jwt.sign(
    {
      sub: user.canonicalId,
      providers: user.identities.map((i) => i.provider),
      roles: user.roles,
    },
    config.auth.jwt.accessTokenSecret,
    {
      expiresIn: config.auth.jwt.accessTokenExpiry,
      issuer: config.auth.jwt.issuer,
      audience: config.auth.jwt.audience,
    }
  );
}

async function generateRefreshToken(userId: string): Promise<{ tokenId: string; token: string }> {
  const tokenId = randomUUID();
  const token = jwt.sign(
    {
      sub: userId,
      type: 'refresh',
      tokenId,
    },
    config.auth.jwt.refreshTokenSecret,
    {
      expiresIn: config.auth.jwt.refreshTokenExpiry,
      issuer: config.auth.jwt.issuer,
      audience: config.auth.jwt.audience,
    }
  );

  return { tokenId, token };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = new Hono();
  const redis = new Redis(cfg.redis.url);

  async function checkRateLimit(ip: string): Promise<boolean> {
    const key = `ratelimit:auth:${ip}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }

    return current <= RATE_LIMIT_REQUESTS;
  }

  app.use(requestId());
  app.use(logger());
  app.use(
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  app.use('*', async (c, next) => {
    const ip = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown';

    if (!(await checkRateLimit(ip))) {
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        },
        429
      );
    }

    await next();
  });

  app.get('/health', (c) => {
    return c.json({
      status: 'healthy',
      service: 'auth-service',
      version: cfg.app.version,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/v1/auth/steam/login', async (c) => {
    const body = await c.req.json<{ steamId: string; ticket: string }>();

    if (!body.steamId || !body.ticket) {
      throw new ValidationError('steamId and ticket are required');
    }

    const steamResponse = await verifySteamTicket(body.ticket, body.steamId);

    if (!steamResponse.response?.authenticated) {
      throw new UnauthorizedError(steamResponse.response?.error || 'Steam authentication failed');
    }

    if (steamResponse.response.steamid !== body.steamId) {
      throw new UnauthorizedError('Steam ID mismatch');
    }

    let user = await prisma.user.findFirst({
      where: {
        identities: {
          some: {
            provider: 'STEAM',
            providerId: body.steamId,
          },
        },
      },
      include: {
        identities: true,
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          canonicalId: `steam_${body.steamId}`,
          displayName: steamResponse.response.personaname || `Steam User ${body.steamId}`,
          avatarUrl: steamResponse.response.avatarfull,
          identities: {
            create: {
              provider: 'STEAM',
              providerId: body.steamId,
            },
          },
        },
        include: {
          identities: true,
        },
      });
    }

    const accessToken = generateAccessToken({
      canonicalId: user.canonicalId,
      identities: user.identities.map((i) => ({ provider: i.provider })),
      roles: user.roles,
    });

    const { token: refreshToken } = await generateRefreshToken(user.id);

    const tokenExpiry = parseInt(config.auth.jwt.accessTokenExpiry.replace('m', '60'), 10) * 60 * 1000;

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          canonicalId: user.canonicalId,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          roles: user.roles,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: tokenExpiry,
          tokenType: 'Bearer',
        },
      },
    });
  });

  app.post('/api/v1/auth/epic/login', async (c) => {
    const body = await c.req.json<{ epicToken: string; epicId: string }>();

    if (!body.epicToken || !body.epicId) {
      throw new ValidationError('epicToken and epicId are required');
    }

    await verifyEpicToken(body.epicToken);

    let user = await prisma.user.findFirst({
      where: {
        identities: {
          some: {
            provider: 'EPIC',
            providerId: body.epicId,
          },
        },
      },
      include: {
        identities: true,
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          canonicalId: `epic_${body.epicId}`,
          displayName: `Epic User ${body.epicId}`,
          identities: {
            create: {
              provider: 'EPIC',
              providerId: body.epicId,
            },
          },
        },
        include: {
          identities: true,
        },
      });
    }

    const accessToken = generateAccessToken({
      canonicalId: user.canonicalId,
      identities: user.identities.map((i) => ({ provider: i.provider })),
      roles: user.roles,
    });

    const { token: refreshToken } = await generateRefreshToken(user.id);

    const tokenExpiry = parseInt(config.auth.jwt.accessTokenExpiry.replace('m', '60'), 10) * 60 * 1000;

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          canonicalId: user.canonicalId,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          roles: user.roles,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: tokenExpiry,
          tokenType: 'Bearer',
        },
      },
    });
  });

  app.post('/api/v1/auth/refresh', async (c) => {
    const body = await c.req.json<{ refreshToken: string }>();

    if (!body.refreshToken) {
      throw new ValidationError('refreshToken is required');
    }

    try {
      const decoded = jwt.verify(body.refreshToken, config.auth.jwt.refreshTokenSecret, {
        issuer: config.auth.jwt.issuer,
        audience: config.auth.jwt.audience,
      }) as TokenPayload & { type: string; tokenId: string };

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        include: {
          identities: true,
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      const accessToken = generateAccessToken({
        canonicalId: user.canonicalId,
        identities: user.identities.map((i) => ({ provider: i.provider })),
        roles: user.roles,
      });

      const { token: newRefreshToken } = await generateRefreshToken(user.id);

      const tokenExpiry = parseInt(config.auth.jwt.accessTokenExpiry.replace('m', '60'), 10) * 60 * 1000;

      return c.json({
        success: true,
        data: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: tokenExpiry,
          tokenType: 'Bearer',
        },
      });
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      throw error;
    }
  });

  app.post('/api/v1/auth/revoke', async (c) => {
    const body = await c.req.json<{ refreshToken: string }>();

    if (!body.refreshToken) {
      throw new ValidationError('refreshToken is required');
    }

    try {
      const decoded = jwt.verify(body.refreshToken, config.auth.jwt.refreshTokenSecret, {
        issuer: config.auth.jwt.issuer,
        audience: config.auth.jwt.audience,
      }) as { sub: string; type: string; tokenId: string };

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      await redis.setex(`revoked:${decoded.tokenId}`, 86400, 'true');

      return c.json({
        success: true,
        message: 'Token revoked successfully',
      });
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      throw error;
    }
  });

  app.post('/api/v1/auth/logout', async (c) => {
    const userId = c.get('userId');

    await redis.keys(`revoked:${userId}:*`).then((keys) => {
      if (keys.length > 0) {
        redis.del(...keys);
      }
    });

    return c.json({
      success: true,
      message: 'Logged out successfully',
    });
  });

  app.get('/api/v1/auth/me', async (c) => {
    const userId = c.get('userId');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        identities: true,
        progressions: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        canonicalId: user.canonicalId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        roles: user.roles,
        identities: user.identities.map((i) => ({
          provider: i.provider,
          providerId: i.providerId,
        })),
        progression: user.progressions[0] || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  });

  app.put('/api/v1/auth/profile', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<{
      displayName?: string;
      avatarUrl?: string;
      bio?: string;
    }>();

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
        bio: body.bio,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        resourceType: 'user',
        resourceId: userId,
        newValue: { displayName: body.displayName, avatarUrl: body.avatarUrl, bio: body.bio },
      },
    });

    return c.json({
      success: true,
      data: user,
    });
  });

  app.post('/api/v1/auth/link/steam', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<{ steamId: string; ticket: string }>();

    if (!body.steamId || !body.ticket) {
      throw new ValidationError('steamId and ticket are required');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { identities: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.identities.some((i) => i.provider === 'STEAM')) {
      throw new ConflictError('Steam account already linked');
    }

    const steamResponse = await verifySteamTicket(body.ticket, body.steamId);

    if (!steamResponse.response?.authenticated) {
      throw new UnauthorizedError('Steam authentication failed');
    }

    const existingSteamIdentity = await prisma.identity.findUnique({
      where: {
        provider_providerId: {
          provider: 'STEAM',
          providerId: body.steamId,
        },
      },
    });

    if (existingSteamIdentity) {
      throw new ConflictError('Steam account already linked to another user');
    }

    await prisma.identity.create({
      data: {
        userId,
        provider: 'STEAM',
        providerId: body.steamId,
      },
    });

    await prisma.accountLink.create({
      data: {
        userId,
        provider: 'STEAM',
        providerId: body.steamId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resourceType: 'identity',
        newValue: { provider: 'STEAM', providerId: body.steamId },
      },
    });

    return c.json({
      success: true,
      message: 'Steam account linked successfully',
    });
  });

  app.post('/api/v1/auth/link/epic', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json<{ epicToken: string; epicId: string }>();

    if (!body.epicToken || !body.epicId) {
      throw new ValidationError('epicToken and epicId are required');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { identities: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.identities.some((i) => i.provider === 'EPIC')) {
      throw new ConflictError('Epic account already linked');
    }

    await verifyEpicToken(body.epicToken);

    const existingEpicIdentity = await prisma.identity.findUnique({
      where: {
        provider_providerId: {
          provider: 'EPIC',
          providerId: body.epicId,
        },
      },
    });

    if (existingEpicIdentity) {
      throw new ConflictError('Epic account already linked to another user');
    }

    await prisma.identity.create({
      data: {
        userId,
        provider: 'EPIC',
        providerId: body.epicId,
      },
    });

    await prisma.accountLink.create({
      data: {
        userId,
        provider: 'EPIC',
        providerId: body.epicId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        resourceType: 'identity',
        newValue: { provider: 'EPIC', providerId: body.epicId },
      },
    });

    return c.json({
      success: true,
      message: 'Epic account linked successfully',
    });
  });

  app.delete('/api/v1/auth/unlink/:provider', async (c) => {
    const userId = c.get('userId');
    const provider = c.req.param('provider').toUpperCase();

    if (provider !== 'STEAM' && provider !== 'EPIC') {
      throw new ValidationError('Invalid provider');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { identities: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const linkedProviders = user.identities.filter((i) => i.provider === provider);

    if (linkedProviders.length === 0) {
      throw new NotFoundError(`${provider} account not linked`);
    }

    if (user.identities.length === 1) {
      throw new ForbiddenError('Cannot unlink last authentication method');
    }

    await prisma.identity.deleteMany({
      where: {
        userId,
        provider: provider as 'STEAM' | 'EPIC',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE',
        resourceType: 'identity',
        newValue: { provider, unlinked: true },
      },
    });

    return c.json({
      success: true,
      message: `${provider} account unlinked successfully`,
    });
  });

  app.get('/api/v1/auth/linked-accounts', async (c) => {
    const userId = c.get('userId');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { identities: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return c.json({
      success: true,
      data: {
        linkedAccounts: user.identities.map((i) => ({
          provider: i.provider,
          providerId: i.providerId,
          linkedAt: i.createdAt,
        })),
        canUnlink: user.identities.length > 1,
      },
    });
  });

  const port = 4001;
  appLogger.info(`Starting Auth Service on port ${port}`);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
    error(error) {
      appLogger.error(error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  appLogger.info(`Auth Service running on http://localhost:${port}`);
}

main().catch((error) => {
  appLogger.fatal('Failed to start Auth Service', error);
  process.exit(1);
});
