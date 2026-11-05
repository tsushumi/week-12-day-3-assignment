'use strict';

const crypto = require('node:crypto');

// Every response carries X-Request-Id (the client's own if it is a sane value),
// and the same id appears in the server log, so one request can be traced.
function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && /^[A-Za-z0-9._-]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
