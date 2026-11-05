'use strict';

const { AppError } = require('../errors/AppError');
const { formatIssues } = require('../utils/zod');

/**
 * validate({ params, query, body }) checks each part with its Zod schema.
 * All problems from all parts are collected into ONE 400 VALIDATION_ERROR, and
 * the parsed (coerced, defaulted, trimmed) values are exposed as req.valid.
 * (Express 5 makes req.query read-only, so the result cannot be written back to it.)
 */
function validate({ params, query, body }) {
  return (req, res, next) => {
    const details = [];
    const valid = {};

    const check = (part, schema, input, rootField) => {
      if (!schema) return;
      const result = schema.safeParse(input);
      if (result.success) valid[part] = result.data;
      else details.push(...formatIssues(result.error, rootField));
    };

    check('params', params, req.params, 'params');
    check('query', query, req.query, 'query');
    if (body) {
      if (req.body === undefined) {
        details.push({ field: 'body', message: 'Request body must be a JSON object' });
      } else {
        check('body', body, req.body, 'body');
      }
    }

    if (details.length > 0) return next(AppError.validation(details));
    req.valid = valid;
    return next();
  };
}

module.exports = { validate };
