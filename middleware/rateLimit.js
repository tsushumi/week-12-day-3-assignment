'use strict';

const crypto = require('node:crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { AppError } = require('../errors/AppError');

// An API key must look like a key before it is trusted as an identity.
const API_KEY_RE = /^[A-Za-z0-9._~-]{8,128}$/;

function humanizeWindow(ms) {
  if (ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (ms % 1000 === 0) {
    const seconds = ms / 1000;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  return `${ms} milliseconds`;
}

function humanizeWait(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// The identity a request is limited under: its API key, else its IP address.
// Keys are hashed, so raw keys are never kept in memory or in the limiter's store.
function keyFor(req) {
  const apiKey = req.get('X-API-Key');
  if (apiKey && API_KEY_RE.test(apiKey)) {
    return `key:${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 32)}`;
  }
  return `ip:${ipKeyGenerator(req.ip)}`; // IPv6 addresses are grouped by /56 so one host cannot use a whole range
}

function buildLimiter({ limit, windowMs, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: false, // draft RateLimit-* headers are not used
    legacyHeaders: true, // X-RateLimit-Limit / -Remaining / -Reset (Unix seconds)
    skip: (req) => req.method === 'OPTIONS', // CORS preflight is free
    handler: (req, res, next) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = Math.max(1, Math.ceil(((resetTime ? resetTime.getTime() : Date.now() + windowMs) - Date.now()) / 1000));
      next(
        new AppError(
          'RATE_LIMIT_EXCEEDED',
          `Too many requests. Please try again in ${humanizeWait(retryAfter)}.`,
          429,
          { limit, window: humanizeWindow(windowMs), retryAfter },
          { headers: { 'Retry-After': String(retryAfter) } }
        )
      );
    },
  });
}

/**
 * Two limiters, applied in this order to everything under /api/v1:
 *
 *  1. ceiling: a generous per-IP cap across ALL api keys. Without it, a client
 *     could invent a new X-API-Key for every request and never be limited.
 *  2. main:    `limit` requests per window per API key (or per IP when no valid key
 *     is sent). This is the one clients see in the X-RateLimit-* headers.
 */
function createRateLimiters({ limit, windowMs, ipCeiling }) {
  const ceiling = buildLimiter({
    limit: Math.max(ipCeiling, limit),
    windowMs,
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
  });
  const main = buildLimiter({ limit, windowMs, keyGenerator: keyFor });
  return [ceiling, main];
}

module.exports = { createRateLimiters, keyFor, humanizeWindow, humanizeWait };
