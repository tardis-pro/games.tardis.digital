export interface AppConfig {
  name: string;
  version: string;
  environment: string;
  port: number;
  logLevel: string;
}

export interface DatabaseConfig {
  url: string;
  poolSize: number;
  maxRetries: number;
  retryDelay: number;
}

export interface RedisConfig {
  url: string;
  keyPrefix: string;
  ttl: {
    session: number;
    refreshToken: number;
    rateLimit: number;
    leaderboard: number;
    idempotency: number;
  };
}

export interface StorageConfig {
  provider: 's3' | 'minio';
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  signedUrlExpiry: number;
}

export interface AuthConfig {
  jwt: {
    accessTokenSecret: string;
    accessTokenExpiry: string;
    refreshTokenSecret: string;
    refreshTokenExpiry: string;
    issuer: string;
    audience: string;
  };
  steam: {
    apiKey: string;
    appId: string;
    apiUrl: string;
  };
  epic: {
    clientId: string;
    clientSecret: string;
    apiUrl: string;
  };
}

export interface MessageQueueConfig {
  provider: 'rabbitmq' | 'kafka';
  url: string;
  queuePrefix: string;
  exchanges: {
    events: string;
    notifications: string;
    ugc: string;
  };
}

export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    port: number;
    path: string;
  };
  tracing: {
    enabled: boolean;
    endpoint: string;
    sampleRate: number;
  };
}

export interface Config {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  storage: StorageConfig;
  auth: AuthConfig;
  messageQueue: MessageQueueConfig;
  monitoring: MonitoringConfig;
}

export function loadConfig(): Config {
  const requiredEnvVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    app: {
      name: process.env.APP_NAME || 'player-platform-suite',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '4000', 10),
      logLevel: process.env.LOG_LEVEL || 'info',
    },
    database: {
      url: process.env.DATABASE_URL,
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      maxRetries: parseInt(process.env.DB_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000', 10),
    },
    redis: {
      url: process.env.REDIS_URL,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'player-platform:',
      ttl: {
        session: parseInt(process.env.REDIS_TTL_SESSION || '86400', 10),
        refreshToken: parseInt(process.env.REDIS_TTL_REFRESH_TOKEN || '2592000', 10),
        rateLimit: parseInt(process.env.REDIS_TTL_RATE_LIMIT || '60', 10),
        leaderboard: parseInt(process.env.REDIS_TTL_LEADERBOARD || '604800', 10),
        idempotency: parseInt(process.env.REDIS_TTL_IDEMPOTENCY || '86400', 10),
      },
    },
    storage: {
      provider: (process.env.STORAGE_PROVIDER as 's3' | 'minio') || 'minio',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || 'player-platform-ugc',
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      signedUrlExpiry: parseInt(process.env.S3_SIGNED_URL_EXPIRY || '3600', 10),
    },
    auth: {
      jwt: {
        accessTokenSecret: process.env.JWT_SECRET,
        accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
        refreshTokenSecret: process.env.JWT_REFRESH_SECRET,
        refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '30d',
        issuer: process.env.JWT_ISSUER || 'player-platform',
        audience: process.env.JWT_AUDIENCE || 'player-platform-api',
      },
      steam: {
        apiKey: process.env.STEAM_API_KEY || '',
        appId: process.env.STEAM_APP_ID || '',
        apiUrl: process.env.STEAM_API_URL || 'https://partner.steam-api.com',
      },
      epic: {
        clientId: process.env.EPIC_CLIENT_ID || '',
        clientSecret: process.env.EPIC_CLIENT_SECRET || '',
        apiUrl: process.env.EPIC_API_URL || 'https://api.epicgames.dev',
      },
    },
    messageQueue: {
      provider: (process.env.MESSAGE_QUEUE_PROVIDER as 'rabbitmq' | 'kafka') || 'rabbitmq',
      url: process.env.RABBITMQ_URL,
      queuePrefix: process.env.MESSAGE_QUEUE_PREFIX || 'player_platform_',
      exchanges: {
        events: 'player_platform_events',
        notifications: 'player_platform_notifications',
        ugc: 'player_platform_ugc',
      },
    },
    monitoring: {
      metrics: {
        enabled: process.env.METRICS_ENABLED === 'true',
        port: parseInt(process.env.METRICS_PORT || '9090', 10),
        path: process.env.METRICS_PATH || '/metrics',
      },
      tracing: {
        enabled: process.env.TRACING_ENABLED === 'true',
        endpoint: process.env.TRACING_ENDPOINT || '',
        sampleRate: parseFloat(process.env.TRACING_SAMPLE_RATE || '0.1'),
      },
    },
  };
}

export const config = loadConfig();
