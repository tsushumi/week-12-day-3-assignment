'use strict';

const { AppError } = require('../errors/AppError');

// Registered with route.all() AFTER the real handlers, so it only runs for methods
// the route does not implement: 405 with an Allow header (not a misleading 404).
function methodNotAllowed(allowed) {
  const allow = allowed.join(', ');
  return (req, res, next) =>
    next(
      new AppError('METHOD_NOT_ALLOWED', `Method ${req.method} is not allowed on this resource`, 405, { allowed }, {
        headers: { Allow: allow },
      })
    );
}

module.exports = { methodNotAllowed };
