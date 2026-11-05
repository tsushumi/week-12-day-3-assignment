# Week 12 Day 3: Invoice API Design

A REST API for invoices and clients, redesigned from a poorly designed original. Covers API design, error handling with Zod validation, versioning, rate limiting and Swagger docs.

- Design write-up: [`api-redesign.md`](api-redesign.md)
- Live docs: `http://localhost:3000/docs` (JSON at `/docs/json`)

## Run

```bash
npm install
cp .env.example .env      # optional, defaults work
npm run dev               # nodemon, or: npm start
npm test                  # 24 tests
```

The server seeds 12 clients and 24 invoices (KES) in memory on every start.

## Quick tour

```bash
curl localhost:3000/api/v1/info
curl "localhost:3000/api/v1/invoices?page=1&limit=5&status=paid"
curl -X POST localhost:3000/api/v1/invoices -H 'Content-Type: application/json' \
  -d '{"clientId":1,"items":[{"description":"Consulting","quantity":2,"unitPrice":1500}],"dueDate":"2026-12-31"}'
curl -X PATCH localhost:3000/api/v1/invoices/1 -H 'Content-Type: application/json' -d '{"status":"PAID"}'
curl -i -X DELETE localhost:3000/api/v1/invoices/5          # 204
curl localhost:3000/api/v1/admin/stats -H 'Authorization: Bearer admin-token-123'
```

Real output (validation error, 404, 409, 401/403 and the 429 after 100 requests) is shown in [`api-redesign.md`](api-redesign.md) formats; run the commands above to see them.

## Layout

```
app.js, server.js, config.js
errors/AppError.js            AppError(code, message, status, details)
middleware/                   errorHandler, validate (Zod), rateLimit, auth, requireJson, methodNotAllowed, notFound, requestId
schemas/                      Zod schemas for invoices and clients
routes/v1/                    invoices, clients, info, admin (each route has @swagger JSDoc)
services/, data/store.js      business rules and seeded in-memory data
docs/openapi.js               swagger-jsdoc setup
test/                         node:test suites
```

## Configuration (`.env`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | 3000 | Port |
| `NODE_ENV` | development | `production` hides 500 messages and disables the demo tokens |
| `ADMIN_API_TOKEN`, `VIEWER_API_TOKEN` | demo tokens outside production | Bearer tokens for `/admin/stats` |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | 100, 900000 | Rate limit |
| `RATE_LIMIT_IP_CEILING` | 1000 | Per-IP cap across all API keys |
| `TRUST_PROXY` | off | Set to the number of proxy hops when behind a proxy, so the IP limit sees real client IPs |

## Bonus: debugging notes

Issues found and fixed while building: Zod 4's default messages differ from the required ones (set a global error map); Express 5 makes `req.query` read-only (validated values go on `req.valid`); a client rotating `X-API-Key` values could bypass the limit (added a per-IP ceiling); rate limiting runs before the JSON parser so malformed bodies are counted too.
