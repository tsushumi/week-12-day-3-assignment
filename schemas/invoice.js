'use strict';

const { z } = require('../utils/zod');
const { paginationQuery, queryInt, positiveIntParam } = require('../utils/pagination');

const STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE'];
const SORT_FIELDS = ['id', 'createdAt', 'dueDate', 'total'];
const SORTS = SORT_FIELDS.flatMap((field) => [field, `-${field}`]);

const hasAtMostTwoDecimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const item = z.strictObject({
  description: z.string().trim().min(1, 'Description is required').max(200, 'At most 200 characters'),
  quantity: z.number().int().min(1, 'Must be at least 1').max(1_000_000, 'Must be at most 1,000,000'),
  unitPrice: z
    .number()
    .min(0, 'Must be 0 or more')
    .max(1_000_000_000, 'Must be at most 1,000,000,000')
    .refine(hasAtMostTwoDecimals, 'At most 2 decimal places'),
});

const isRealDate = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')
  .refine(isRealDate, 'Not a valid calendar date');

const fields = {
  clientId: z.number().int().min(1, 'Must be a positive integer'),
  items: z.array(item).min(1, 'At least one item is required').max(100, 'At most 100 items'),
  dueDate,
  status: z.enum(STATUSES),
};

const invoiceNumber = z.string().regex(/^INV-\d{4}-\d{3,6}$/, 'Must look like INV-2026-001');

// POST: clientId, items and dueDate are required. invoiceNumber is generated
// when omitted; a new invoice starts as DRAFT or SENT.
const createBody = z.strictObject({
  clientId: fields.clientId,
  items: fields.items,
  dueDate: fields.dueDate,
  invoiceNumber: invoiceNumber.optional(),
  status: z.enum(['DRAFT', 'SENT']).optional(),
});

// PUT: full replacement of every writable field
const replaceBody = z.strictObject({
  clientId: fields.clientId,
  items: fields.items,
  dueDate: fields.dueDate,
  status: fields.status,
});

// PATCH: any subset of the writable fields, but not nothing
const patchBody = z
  .strictObject({
    clientId: fields.clientId.optional(),
    items: fields.items.optional(),
    dueDate: fields.dueDate.optional(),
    status: fields.status.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

const listQuery = z.object({
  ...paginationQuery,
  status: z
    .string()
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(STATUSES))
    .optional(),
  clientId: queryInt({ min: 1, max: 999_999_999 }),
  sort: z.enum(SORTS).default('id'),
});

// GET /clients/:id/invoices: clientId comes from the path
const nestedListQuery = z.object({
  ...paginationQuery,
  status: listQuery.shape.status,
  sort: listQuery.shape.sort,
});

const idParams = z.object({ id: positiveIntParam });

module.exports = { STATUSES, SORTS, createBody, replaceBody, patchBody, listQuery, nestedListQuery, idParams };
