'use strict';

const { z } = require('../utils/zod');
const { paginationQuery, positiveIntParam } = require('../utils/pagination');

const SORTS = ['id', '-id', 'name', '-name', 'createdAt', '-createdAt'];

const fields = {
  name: z.string().trim().min(1, 'Name is required').max(120, 'At most 120 characters'),
  email: z.email('Must be a valid email address').max(200, 'At most 200 characters').transform((value) => value.toLowerCase()),
  phone: z.string().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'Must be a valid phone number'),
  company: z.string().trim().min(1, 'Company cannot be empty').max(120, 'At most 120 characters'),
};

// POST and PUT take the same fields; PUT replaces, so omitted optional fields are cleared
const createBody = z.strictObject({
  name: fields.name,
  email: fields.email,
  phone: fields.phone.optional(),
  company: fields.company.optional(),
});
const replaceBody = createBody;

const patchBody = z
  .strictObject({
    name: fields.name.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    company: fields.company.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

const listQuery = z.object({
  ...paginationQuery,
  q: z.string().trim().min(1, 'Search text cannot be empty').max(100, 'At most 100 characters').optional(),
  sort: z.enum(SORTS).default('id'),
});

const idParams = z.object({ id: positiveIntParam });

module.exports = { SORTS, createBody, replaceBody, patchBody, listQuery, idParams };
