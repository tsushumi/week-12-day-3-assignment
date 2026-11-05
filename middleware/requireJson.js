'use strict';

const { AppError } = require('../errors/AppError');

// A request that sends a body must say it is JSON; otherwise express.json() skips
// it and the handler would see "no body", which is a confusing error for the client.
function requireJson(req, res, next) {
  const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length']) > 0;
  if (hasBody && !req.is('application/json')) {
    return next(
      new AppError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json', 415, {
        received: req.get('Content-Type') || null,
      })
    );
  }
  return next();
}

module.exports = { requireJson };
