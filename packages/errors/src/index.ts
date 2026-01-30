export interface ErrorOptions {
  code?: string;
  statusCode?: number;
  message?: string;
  details?: Record<string, unknown>;
  cause?: Error;
}

export abstract class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    options: ErrorOptions = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.statusCode = options.statusCode || 500;
    this.details = options.details;
    this.isOperational = true;

    if (options.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: 'BAD_REQUEST',
      statusCode: 400,
      ...options,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', options: ErrorOptions = {}) {
    super(message, {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      ...options,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', options: ErrorOptions = {}) {
    super(message, {
      code: 'FORBIDDEN',
      statusCode: 403,
      ...options,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, options: ErrorOptions = {}) {
    super(`${resource} not found`, {
      code: 'NOT_FOUND',
      statusCode: 404,
      ...options,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, {
      code: 'CONFLICT',
      statusCode: 409,
      ...options,
    });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests', options: ErrorOptions = {}) {
    super(message, {
      code: 'TOO_MANY_REQUESTS',
      statusCode: 429,
      ...options,
    });
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', options: ErrorOptions = {}) {
    super(message, {
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      ...options,
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', options: ErrorOptions = {}) {
    super(message, {
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
      ...options,
    });
  }
}

export class ValidationError extends BadRequestError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'VALIDATION_ERROR', details });
  }
}

export class RateLimitError extends TooManyRequestsError {
  constructor(retryAfter: number) {
    super('Rate limit exceeded', {
      code: 'RATE_LIMIT_EXCEEDED',
      details: { retryAfter },
    });
  }
}

export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

export function mapErrorToStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}

export function formatErrorResponse(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'An unknown error occurred',
  };
}
