'use strict';

/**
 * Every failure in the API is (or is converted into) an AppError, so the global
 * error handler can answer with one response shape:
 *
 *   { "error": { "code", "message", "status", "details" } }
 */
class AppError extends Error {
  /**
   * @param {string} code     machine-readable, stable (e.g. "RESOURCE_NOT_FOUND")
   * @param {string} message  human-readable, safe to show to the client
   * @param {number} status   HTTP status code
   * @param {*}      details  optional extra data (field errors, limits, ...) or null
   * @param {{ headers?: Record<string,string> }} [options]  extra response headers
   */
  constructor(code, message, status = 500, details = null, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.headers = options.headers || {};
    Error.captureStackTrace?.(this, AppError);
  }

  static validation(details = null, message = 'Request validation failed') {
    return new AppError('VALIDATION_ERROR', message, 400, details);
  }

  static authRequired(message = 'Authentication is required. Send an "Authorization: Bearer <token>" header') {
    return new AppError('AUTHENTICATION_REQUIRED', message, 401, null, {
      headers: { 'WWW-Authenticate': 'Bearer realm="invoice-api"' },
    });
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(resource, id) {
    return new AppError('RESOURCE_NOT_FOUND', `${resource} with ID ${id} was not found`, 404);
  }

  static conflict(message, details = null) {
    return new AppError('CONFLICT', message, 409, details);
  }

  static internal(message = 'An unexpected error occurred. Please try again later') {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}

module.exports = { AppError };
