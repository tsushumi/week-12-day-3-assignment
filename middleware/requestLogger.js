'use strict';

function requestLogger(log) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms) [${req.id}]`);
    });
    next();
  };
}

module.exports = { requestLogger };
