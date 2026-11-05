'use strict';

const crypto = require('node:crypto');
const { AppError } = require('../errors/AppError');

const digest = (value) => crypto.createHash('sha256').update(value).digest();

/**
 * Bearer-token authentication for the protected (admin) routes.
 *   no / malformed / unknown token  -> 401 AUTHENTICATION_REQUIRED
 *   valid token, wrong role         -> 403 FORBIDDEN   (see requireRole)
 * Tokens are compared as SHA-256 digests with timingSafeEqual, so the comparison
 * time does not reveal how much of a guessed token was right.
 */
function createAuthenticator(tokens) {
  const known = Object.entries(tokens)
    .filter(([, token]) => Boolean(token))
    .map(([role, token]) => [role, digest(token)]);

  return function authenticate(req, res, next) {
    const header = req.get('Authorization');
    if (!header) return next(AppError.authRequired('No authentication token provided. Send an "Authorization: Bearer <token>" header'));

    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    if (!match) return next(AppError.authRequired('The Authorization header must use the Bearer scheme: "Bearer <token>"'));

    const presented = digest(match[1]);
    const found = known.find(([, expected]) => crypto.timingSafeEqual(presented, expected));
    if (!found) return next(AppError.authRequired('The authentication token is invalid'));

    req.user = { role: found[0] };
    return next();
  };
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return next(AppError.authRequired());
    if (req.user.role !== role) {
      return next(AppError.forbidden(`Your role ("${req.user.role}") is not allowed to access this resource; "${role}" is required`));
    }
    return next();
  };
}

module.exports = { createAuthenticator, requireRole };
