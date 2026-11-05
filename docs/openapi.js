'use strict';

const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');
const { API_VERSION, API_PREFIX } = require('../config');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const errorExample = (code, message, status, details = null) => ({ error: { code, message, status, details } });
const errorResponse = (description, example) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorResponse'), example } },
});
const listOf = (name) => ({
  type: 'object',
  required: ['success', 'data', 'meta'],
  properties: { success: { type: 'boolean', example: true }, data: { type: 'array', items: ref(name) }, meta: ref('PaginationMeta') },
});
const single = (name) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: { success: { type: 'boolean', example: true }, data: ref(name) },
});

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Invoice API',
    version: API_VERSION,
    description:
      'REST API for managing invoices and clients (amounts in KES).\n\n' +
      '**Success format:** `{ "success": true, "data": ..., "meta": { page, limit, total, totalPages } }`\n\n' +
      '**Error format:** `{ "error": { "code", "message", "status", "details" } }`\n\n' +
      '**Rate limit:** 100 requests per 15 minutes per `X-API-Key` (or per IP). See the `X-RateLimit-*` response headers.',
  },
  servers: [{ url: API_PREFIX, description: 'Version 1' }],
  tags: [
    { name: 'Invoices' },
    { name: 'Clients' },
    { name: 'Meta' },
    { name: 'Admin' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'Demo tokens: admin-token-123 (admin), viewer-token-123 (viewer)' },
      apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'Optional. Rate limits are counted per key instead of per IP.' },
    },
    parameters: {
      Page: { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
      Limit: { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      InvoiceId: { in: 'path', name: 'id', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 },
      ClientId: { in: 'path', name: 'id', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 },
    },
    headers: {},
    schemas: {
      InvoiceStatus: { type: 'string', enum: ['DRAFT', 'SENT', 'PAID', 'OVERDUE'] },
      InvoiceItem: {
        type: 'object',
        required: ['description', 'quantity', 'unitPrice'],
        properties: {
          description: { type: 'string', maxLength: 200, example: 'Website design' },
          quantity: { type: 'integer', minimum: 1, example: 1 },
          unitPrice: { type: 'number', minimum: 0, example: 85000 },
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          invoiceNumber: { type: 'string', example: 'INV-2026-001' },
          clientId: { type: 'integer', example: 3 },
          status: ref('InvoiceStatus'),
          items: { type: 'array', items: ref('InvoiceItem') },
          total: { type: 'number', description: 'KES, computed by the server', example: 115000 },
          dueDate: { type: 'string', format: 'date', example: '2026-10-01' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateInvoice: {
        type: 'object',
        required: ['clientId', 'items', 'dueDate'],
        properties: {
          clientId: { type: 'integer', minimum: 1, example: 1 },
          items: { type: 'array', minItems: 1, maxItems: 100, items: ref('InvoiceItem') },
          dueDate: { type: 'string', format: 'date', example: '2026-12-31' },
          invoiceNumber: { type: 'string', pattern: '^INV-\\d{4}-\\d{3,6}$', description: 'Generated when omitted' },
          status: { type: 'string', enum: ['DRAFT', 'SENT'], default: 'DRAFT' },
        },
      },
      ReplaceInvoice: {
        type: 'object',
        required: ['clientId', 'items', 'dueDate', 'status'],
        properties: {
          clientId: { type: 'integer', minimum: 1 },
          items: { type: 'array', minItems: 1, items: ref('InvoiceItem') },
          dueDate: { type: 'string', format: 'date' },
          status: ref('InvoiceStatus'),
        },
      },
      UpdateInvoice: {
        type: 'object',
        minProperties: 1,
        properties: {
          clientId: { type: 'integer', minimum: 1 },
          items: { type: 'array', minItems: 1, items: ref('InvoiceItem') },
          dueDate: { type: 'string', format: 'date' },
          status: ref('InvoiceStatus'),
        },
      },
      Client: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Wanjiru Kamau' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', example: '+254 712 345 678' },
          company: { type: 'string', example: 'Savannah Coffee Traders' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateClient: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', maxLength: 120 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          company: { type: 'string', maxLength: 120 },
        },
      },
      UpdateClient: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', maxLength: 120 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          company: { type: 'string', maxLength: 120 },
        },
      },
      PaginationMeta: {
        type: 'object',
        required: ['page', 'limit', 'total', 'totalPages'],
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 24 },
          totalPages: { type: 'integer', example: 2 },
        },
      },
      InvoiceList: listOf('Invoice'),
      ClientList: listOf('Client'),
      InvoiceResponse: single('Invoice'),
      ClientResponse: single('Client'),
      ApiInfo: {
        type: 'object',
        properties: { version: { type: 'string', example: API_VERSION }, prefix: { type: 'string', example: API_PREFIX } },
      },
      AdminStatsResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              clients: { type: 'integer' },
              invoices: { type: 'integer' },
              invoicesByStatus: { type: 'object', additionalProperties: { type: 'integer' } },
              revenueCollected: { type: 'number' },
              outstanding: { type: 'number' },
              currency: { type: 'string', example: 'KES' },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'status', 'details'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR', 'AUTHENTICATION_REQUIRED', 'FORBIDDEN', 'RESOURCE_NOT_FOUND', 'METHOD_NOT_ALLOWED',
                  'CONFLICT', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'RATE_LIMIT_EXCEEDED', 'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              status: { type: 'integer' },
              details: { nullable: true, description: 'Array of {field, message} for validation errors; otherwise an object or null' },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: errorResponse(
        'Validation failed',
        errorExample('VALIDATION_ERROR', 'Request validation failed', 400, [{ field: 'dueDate', message: 'Must be a date in YYYY-MM-DD format' }])
      ),
      Unauthorized: {
        ...errorResponse('Missing or invalid token', errorExample('AUTHENTICATION_REQUIRED', 'No authentication token provided', 401)),
        headers: { 'WWW-Authenticate': { schema: { type: 'string' } } },
      },
      Forbidden: errorResponse('Role not allowed', errorExample('FORBIDDEN', 'Your role ("viewer") is not allowed to access this resource', 403)),
      NotFound: errorResponse('Resource does not exist', errorExample('RESOURCE_NOT_FOUND', 'Invoice with ID 999 was not found', 404)),
      Conflict: errorResponse('Conflicts with current state', errorExample('CONFLICT', 'Invoice number INV-2026-001 already exists', 409)),
      UnsupportedMediaType: errorResponse('Content-Type is not application/json', errorExample('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json', 415)),
      TooManyRequests: {
        ...errorResponse(
          'Rate limit exceeded',
          errorExample('RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again in 15 minutes.', 429, { limit: 100, window: '15 minutes', retryAfter: 900 })
        ),
        headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until the window resets' } },
      },
      InternalError: errorResponse('Unexpected server error', errorExample('INTERNAL_ERROR', 'An unexpected error occurred. Please try again later', 500)),
    },
  },
  security: [{ apiKeyAuth: [] }],
};

function buildSpec() {
  return swaggerJsdoc({ definition, apis: [path.join(__dirname, '..', 'routes', 'v1', '*.js')] });
}

module.exports = { buildSpec };
