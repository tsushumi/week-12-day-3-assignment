# Invoice API Redesign

Task 1 of Week 12 Day 3. The original API was inconsistent and hard to use. This document lists what was wrong, then gives the redesigned REST API that is implemented in this project under `/api/v1`.

## 1. Problems in the original API

| # | Problem | Original example | Why it hurts | Fix |
|---|---------|------------------|--------------|-----|
| 1 | **Verbs in URLs** | `GET /getInvoices`, `POST /createInvoice` | The HTTP method already is the verb; every action invents a new URL to learn | Nouns only: `GET /invoices`, `POST /invoices` |
| 2 | **POST used for delete** | `POST /deleteInvoice` | Wrong semantics: proxies, caches and clients can't tell it is a delete or safely retry it | `DELETE /invoices/:id` |
| 3 | **IDs in the query string or body** | `GET /getInvoice?id=5`, `POST /deleteInvoice {"id":5}` | The identity of a resource belongs in its URL; query strings are for filtering | `GET /invoices/5` |
| 4 | **Inconsistent naming** | `/invoice` vs `/clients`, `invoice_number` vs `clientId` | Developers can't guess the next URL or field name | Plural nouns everywhere, camelCase JSON fields |
| 5 | **Four different error shapes** | `"Not found"` (plain text), `{err:"..."}`, `{message:"..."}`, `{status:"error",msg:"..."}` | Clients need four parsers; plain text can't carry details | One shape: `{error:{code,message,status,details}}` |
| 6 | **No pagination** | `GET /getInvoices` returns every invoice | Slow and heavy as data grows; can take the server down | `?page=1&limit=20` and `meta:{page,limit,total,totalPages}` |
| 7 | **No input validation** | Bad data was stored; missing fields crashed the handler (500) | Corrupt data and unhelpful errors | Zod schemas; 400 with per-field `details` |
| 8 | **PUT used for an RPC-style status change** | `PUT /invoice/5/markPaid` | Not a resource; PUT means "replace" and must be idempotent | `PATCH /invoices/5 {"status":"PAID"}` with a status state machine |
| 9 | **Wrong status codes** | `200` for errors and for creation, `500` for bad input, `200` with empty body for delete | Clients can't rely on the status line | 201 Created (+`Location`), 204 No Content, 400/404/409 for client errors, 500 only for real bugs |
| 10 | **No versioning** | `/getInvoices` | Any change breaks every client | `/api/v1/...`; unknown versions give 404 |
| 11 | **No rate limiting** | none | One misbehaving client can starve everyone | 100 requests / 15 min per API key or IP, with `X-RateLimit-*` headers |
| 12 | **No documentation** | none | Integrators read the source | OpenAPI/Swagger at `/docs` |
| 13 | **Leaked internals in 500s** | Stack traces and DB messages returned to clients | Information disclosure | Real message hidden in production, logged server-side with the stack |
| 14 | **Inconsistent response format** | Sometimes a bare array, sometimes an object | Clients special-case each endpoint | `{success:true,data,meta}` envelope |

### Old to new mapping

| Old | New |
|-----|-----|
| `GET /getInvoices` | `GET /api/v1/invoices` |
| `GET /getInvoice?id=5` | `GET /api/v1/invoices/5` |
| `POST /createInvoice` | `POST /api/v1/invoices` |
| `POST /updateInvoice {id,...}` | `PUT` or `PATCH /api/v1/invoices/5` |
| `PUT /invoice/5/markPaid` | `PATCH /api/v1/invoices/5` with `{"status":"PAID"}` |
| `POST /deleteInvoice {id}` | `DELETE /api/v1/invoices/5` |
| `GET /clientInvoices?clientId=3` | `GET /api/v1/clients/3/invoices` |

## 2. Redesigned API

Base URL: `/api/v1`. All bodies are JSON (`Content-Type: application/json`).

### Invoices

| Method | Endpoint | Description | Request Body | Success Response |
|--------|----------|-------------|--------------|------------------|
| GET | `/invoices` | List invoices (`page`, `limit`, `status`, `clientId`, `sort`) | none | `200` `{success,data:[Invoice],meta:{page,limit,total,totalPages}}` |
| POST | `/invoices` | Create an invoice (total is computed by the server) | `{clientId,items:[{description,quantity,unitPrice}],dueDate,invoiceNumber?,status?}` | `201` `{success,data:Invoice}` + `Location` |
| GET | `/invoices/:id` | Get one invoice | none | `200` `{success,data:Invoice}` |
| PUT | `/invoices/:id` | Replace the writable fields | `{clientId,items,dueDate,status}` (all required) | `200` `{success,data:Invoice}` |
| PATCH | `/invoices/:id` | Partial update, including status changes | any subset of `{clientId,items,dueDate,status}` (at least one) | `200` `{success,data:Invoice}` |
| DELETE | `/invoices/:id` | Delete an invoice (not allowed once PAID) | none | `204` no body |

### Clients

| Method | Endpoint | Description | Request Body | Success Response |
|--------|----------|-------------|--------------|------------------|
| GET | `/clients` | List clients (`page`, `limit`, `q`, `sort`) | none | `200` `{success,data:[Client],meta}` |
| POST | `/clients` | Create a client | `{name,email,phone?,company?}` | `201` `{success,data:Client}` + `Location` |
| GET | `/clients/:id` | Get one client | none | `200` `{success,data:Client}` |
| PUT | `/clients/:id` | Replace a client | `{name,email,phone?,company?}` | `200` `{success,data:Client}` |
| PATCH | `/clients/:id` | Partial update | any subset of the fields | `200` `{success,data:Client}` |
| DELETE | `/clients/:id` | Delete a client (409 if it still has invoices) | none | `204` no body |
| GET | `/clients/:id/invoices` | A client's invoices (`page`, `limit`, `status`, `sort`) | none | `200` `{success,data:[Invoice],meta}` |

### Meta, admin and docs

| Method | Endpoint | Description | Success Response |
|--------|----------|-------------|------------------|
| GET | `/api/v1/info` | API version | `200` `{"version":"1.0.0","prefix":"/api/v1"}` |
| GET | `/api/v1/admin/stats` | Admin-only statistics (Bearer token) | `200` `{success,data:{...}}` |
| GET | `/docs` | Swagger UI | HTML |
| GET | `/docs/json` | OpenAPI 3 document | JSON |
| GET | `/health` | Liveness check | `{"status":"ok"}` |

### Design rules

- **Resources are plural nouns**; the method is the verb; ids are in the path; filters are in the query string.
- **PUT replaces, PATCH changes part.** Server-owned fields (`id`, `total`, `createdAt`, `updatedAt`, `invoiceNumber` after creation) are read-only; sending them is a 400.
- **Status workflow:** `DRAFT -> SENT -> PAID | OVERDUE`, `OVERDUE -> PAID`. PAID is final. An invalid change is `409 CONFLICT`.
- **Invalid paging parameters are rejected (400), not silently corrected.** `limit` is 1 to 100, default 20.
- **Wrong method on a real URL is 405** with an `Allow` header, not 404.
- **A body that references a missing client** (`clientId: 999`) is a 400 on the `clientId` field; `GET /clients/999/invoices` is a 404 because the client is the resource in the URL.

## 3. Response formats

Success:

```json
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 24, "totalPages": 2 } }
```

Error (the only error shape, for every failure):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "status": 400,
    "details": [ { "field": "dueDate", "message": "Must be a date in YYYY-MM-DD format" } ]
  }
}
```

### Error codes

| Code | Status | When |
|------|--------|------|
| `VALIDATION_ERROR` | 400 | Bad body, query or path parameter, malformed JSON |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid token (`WWW-Authenticate: Bearer`) |
| `FORBIDDEN` | 403 | Valid token, insufficient role |
| `RESOURCE_NOT_FOUND` | 404 | Unknown resource or route |
| `METHOD_NOT_ALLOWED` | 405 | Method not supported on that URL (`Allow` header) |
| `CONFLICT` | 409 | Duplicate invoice number or client email, invalid status change, modifying a PAID invoice, deleting a client that has invoices |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 100 KB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Body not sent as `application/json` |
| `RATE_LIMIT_EXCEEDED` | 429 | More than 100 requests in 15 minutes (`Retry-After`) |
| `INTERNAL_ERROR` | 500 | Unexpected failure; the real message is hidden when `NODE_ENV=production` |

## 4. Rate limiting

100 requests per 15 minutes, counted per `X-API-Key` (when it is a well-formed key) or per IP. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix seconds). The 429 adds `Retry-After` (seconds). A second, much larger per-IP ceiling (default 1000) stops a client from inventing a new API key on every request to avoid the limit.
