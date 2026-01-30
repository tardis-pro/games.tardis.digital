import pino, { Logger, LoggerOptions } from 'pino';

export interface LogContext {
  requestId?: string;
  userId?: string;
  service?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface LogEntry {
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  time: number;
  msg: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
}

const createLogger = (options?: Partial<LoggerOptions>): Logger => {
  const logLevel = process.env.LOG_LEVEL || 'info';

  return pino({
    level: logLevel,
    transport: options?.transport || {
      target: 'pino/file',
      options: { destination: 1 },
    },
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
  });
};

export class LoggerService {
  private logger: Logger;
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.logger = createLogger();
    this.context = context;
  }

  withContext(additionalContext: LogContext): LoggerService {
    return new LoggerService({
      ...this.context,
      ...additionalContext,
    });
  }

  fatal(message: string, metadata?: Record<string, unknown>): void {
    this.logger.fatal({ ...this.context, ...metadata }, message);
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const errorInfo = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
    } : { message: String(error) };

    this.logger.error({ ...this.context, error: errorInfo, ...metadata }, message);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn({ ...this.context, ...metadata }, message);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info({ ...this.context, ...metadata }, message);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug({ ...this.context, ...metadata }, message);
  }

  trace(message: string, metadata?: Record<string, unknown>): void {
    this.logger.trace({ ...this.context, ...metadata }, message);
  }

  child(context: LogContext): LoggerService {
    return this.withContext(context);
  }

  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.flush();
      resolve();
    });
  }
}

export const createRootLogger = (serviceName: string): LoggerService => {
  return new LoggerService({ service: serviceName });
};

export const logger = createRootLogger('player-platform');
