'use strict';

const { AppError } = require('../errors/AppError');
const { formatIssues } = require('../utils/zod');

// Used when a framework/library error carries a status but is not an AppError.
const CODE_BY_STATUS = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'FORBIDDEN',
  404: 'RESOURCE_NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMIT_EXCEEDED',
};

const HIDDEN_MESSAGE = 'An unexpected error occurred. Please try again later';

// Turns ANY thrown value into an AppError.
function normalize(err, { isProduction }) {
  if (err instanceof AppError) return err;

  // A ZodError that escaped a route (validate() normally catches these first)
  if (err?.name === 'ZodError' && Array.isArray(err.issues)) return AppError.validation(formatIssues(err));

  // body-parser (express.json) errors
  if (err?.type === 'entity.parse.failed') {
    return AppError.validation(null, 'Request body contains invalid JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large (limit is 100kb)', 413);
  }
  if (err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') {
    return new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported content encoding or charset', 415);
  }

  // Other client errors raised by Express/body-parser (status 4xx, safe to show)
  const status = err?.status ?? err?.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500 && err.expose !== false) {
    return new AppError(CODE_BY_STATUS[status] || 'REQUEST_ERROR', err.message || 'Bad request', status);
  }

  // Everything else is a bug or an outage: 500, and the real message stays on the server in production.
  const message = !isProduction && err?.message ? err.message : HIDDEN_MESSAGE;
  return AppError.internal(message);
}

function errorHandler({ isProduction, logError = console.error }) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    const appError = normalize(err, { isProduction });

    if (appError.status >= 500) {
      // The full error (with stack) is always logged, whatever the client is told.
      logError(`[${req.id}] ${req.method} ${req.originalUrl} failed:`, err instanceof Error ? err.stack : err);
    }

    for (const [name, value] of Object.entries(appError.headers)) res.set(name, value);
    return res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        status: appError.status,
        details: appError.details ?? null,
      },
    });
  };
}

module.exports = { errorHandler, normalize, HIDDEN_MESSAGE };
