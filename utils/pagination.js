'use strict';

const { z } = require('./zod');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Query-string integer: "5" -> 5, with a range check and an optional default.
// Anything else (abc, 1.5, -1, 0) is a 400 instead of being silently "fixed".
function queryInt({ min, max, fallback }) {
  const schema = z
    .string()
    .regex(/^\d{1,9}$/, 'Must be a whole number')
    .transform(Number)
    .refine((n) => n >= min && n <= max, max === Infinity ? `Must be at least ${min}` : `Must be between ${min} and ${max}`);
  return fallback === undefined ? schema.optional() : schema.default(fallback);
}

const paginationQuery = {
  page: queryInt({ min: 1, max: Infinity, fallback: DEFAULT_PAGE }),
  limit: queryInt({ min: 1, max: MAX_LIMIT, fallback: DEFAULT_LIMIT }),
};

const positiveIntParam = z
  .string()
  .regex(/^\d{1,9}$/, 'Must be a positive integer')
  .transform(Number)
  .refine((n) => n > 0, 'Must be a positive integer');

// rows are already filtered and sorted
function paginate(rows, { page, limit }) {
  const total = rows.length;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// "-total" -> descending by total; ties are broken by id so pages are stable
function sortRows(rows, sort) {
  const descending = sort.startsWith('-');
  const key = descending ? sort.slice(1) : sort;
  const direction = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (a[key] < b[key]) return -1 * direction;
    if (a[key] > b[key]) return 1 * direction;
    return a.id - b.id;
  });
}

module.exports = { queryInt, paginationQuery, positiveIntParam, paginate, sortRows, DEFAULT_LIMIT, MAX_LIMIT };
