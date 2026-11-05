'use strict';

const { AppError } = require('../errors/AppError');

// Unknown route (including unknown API versions such as /api/v2/...).
function notFound(req, res, next) {
  const path = req.path.length > 200 ? `${req.path.slice(0, 200)}...` : req.path;
  next(new AppError('RESOURCE_NOT_FOUND', `Route ${req.method} ${path} was not found`, 404));
}

module.exports = { notFound };
