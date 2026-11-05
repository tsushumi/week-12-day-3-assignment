'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, validInvoice } = require('./helpers');

let app;
test.before(async () => { app = await startApp(); });
test.after(async () => { await app.close(); });

const ERROR_KEYS = ['code', 'message', 'status', 'details'];
function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.deepEqual(Object.keys(res.json), ['error']);
  assert.deepEqual(Object.keys(res.json.error), ERROR_KEYS);
  assert.equal(res.json.error.code, code);
  assert.equal(res.json.error.status, status);
}

test('GET /api/v1/info returns bare version object', async () => {
  const res = await app.request('GET', '/api/v1/info');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { version: '1.0.0', prefix: '/api/v1' });
});

test('invoice list: envelope, default pagination, seeds', async () => {
  const res = await app.request('GET', '/api/v1/invoices');
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.data.length, 20);
  assert.deepEqual(res.json.meta, { page: 1, limit: 20, total: 24, totalPages: 2 });
  const inv = res.json.data[0];
  for (const k of ['id', 'invoiceNumber', 'clientId', 'status', 'total', 'dueDate', 'createdAt']) assert.ok(k in inv, k);
});

test('pagination page 2, filters, sort and invalid params', async () => {
  const p2 = await app.request('GET', '/api/v1/invoices?page=2&limit=20');
  assert.equal(p2.json.data.length, 4);
  const st = await app.request('GET', '/api/v1/invoices?status=paid&limit=100');
  assert.ok(st.json.data.length > 0 && st.json.data.every((i) => i.status === 'PAID'));
  const sorted = await app.request('GET', '/api/v1/invoices?sort=-total&limit=100');
  const totals = sorted.json.data.map((i) => i.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a));
  for (const q of ['page=0', 'limit=101', 'limit=abc', 'status=BOGUS', 'sort=nope']) {
    assertError(await app.request('GET', `/api/v1/invoices?${q}`), 400, 'VALIDATION_ERROR');
  }
});

test('create invoice: 201, Location, computed total, generated number', async () => {
  const res = await app.request('POST', '/api/v1/invoices', { body: validInvoice() });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.data.total, 3001);
  assert.equal(res.json.data.status, 'DRAFT');
  assert.equal(res.json.data.invoiceNumber, 'INV-2026-025');
  assert.equal(res.headers.get('location'), `/api/v1/invoices/${res.json.data.id}`);
  const got = await app.request('GET', `/api/v1/invoices/${res.json.data.id}`);
  assert.equal(got.status, 200);
});

test('create invoice validation: details are [{field,message}] and all collected', async () => {
  const res = await app.request('POST', '/api/v1/invoices', {
    body: { clientId: 'x', items: [{ description: '', quantity: 0, unitPrice: -1 }], dueDate: '31/12/2026', total: 5 },
  });
  assertError(res, 400, 'VALIDATION_ERROR');
  assert.equal(res.json.error.message, 'Request validation failed');
  const fields = res.json.error.details.map((d) => d.field);
  for (const f of ['clientId', 'items[0].description', 'items[0].quantity', 'items[0].unitPrice', 'dueDate', 'total']) {
    assert.ok(fields.includes(f), `${f} in ${fields}`);
  }
  for (const d of res.json.error.details) assert.deepEqual(Object.keys(d), ['field', 'message']);
  const empty = await app.request('POST', '/api/v1/invoices', { body: validInvoice({ items: [] }) });
  assert.deepEqual(empty.json.error.details, [{ field: 'items', message: 'At least one item is required' }]);
});

test('create invoice: unknown client -> 400, duplicate number -> 409', async () => {
  const bad = await app.request('POST', '/api/v1/invoices', { body: validInvoice({ clientId: 999 }) });
  assertError(bad, 400, 'VALIDATION_ERROR');
  assert.equal(bad.json.error.details[0].field, 'clientId');
  const dup = await app.request('POST', '/api/v1/invoices', { body: validInvoice({ invoiceNumber: 'INV-2026-001' }) });
  assertError(dup, 409, 'CONFLICT');
  assert.match(dup.json.error.message, /INV-2026-001 already exists/);
});

test('body problems: bad JSON, no body, wrong content type, too large', async () => {
  const badJson = await app.request('POST', '/api/v1/invoices', { raw: '{"a":', headers: { 'Content-Type': 'application/json' } });
  assertError(badJson, 400, 'VALIDATION_ERROR');
  const none = await app.request('POST', '/api/v1/invoices', {});
  assertError(none, 400, 'VALIDATION_ERROR');
  assert.equal(none.json.error.details[0].field, 'body');
  const text = await app.request('POST', '/api/v1/invoices', { raw: 'hello', headers: { 'Content-Type': 'text/plain' } });
  assertError(text, 415, 'UNSUPPORTED_MEDIA_TYPE');
  const big = await app.request('POST', '/api/v1/invoices', { raw: JSON.stringify({ pad: 'x'.repeat(200_000) }), headers: { 'Content-Type': 'application/json' } });
  assertError(big, 413, 'PAYLOAD_TOO_LARGE');
  const arr = await app.request('POST', '/api/v1/invoices', { body: [] });
  assertError(arr, 400, 'VALIDATION_ERROR');
});

test('GET one: 200, 404 shape, 400 for non-numeric id', async () => {
  assert.equal((await app.request('GET', '/api/v1/invoices/1')).json.data.invoiceNumber, 'INV-2026-001');
  const nf = await app.request('GET', '/api/v1/invoices/9999');
  assertError(nf, 404, 'RESOURCE_NOT_FOUND');
  assert.equal(nf.json.error.message, 'Invoice with ID 9999 was not found');
  assert.equal(nf.json.error.details, null);
  const bad = await app.request('GET', '/api/v1/invoices/abc');
  assertError(bad, 400, 'VALIDATION_ERROR');
  assert.equal(bad.json.error.details[0].field, 'id');
});

test('PUT replaces, PATCH partial, read-only fields rejected, status rules', async () => {
  const put = await app.request('PUT', '/api/v1/invoices/5', { body: { clientId: 2, items: [{ description: 'X', quantity: 1, unitPrice: 10 }], dueDate: '2027-01-01', status: 'DRAFT' } });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.json.data.total, 10);
  const putMissing = await app.request('PUT', '/api/v1/invoices/5', { body: { clientId: 2 } });
  assertError(putMissing, 400, 'VALIDATION_ERROR');
  const ro = await app.request('PATCH', '/api/v1/invoices/5', { body: { total: 1 } });
  assertError(ro, 400, 'VALIDATION_ERROR');
  assert.equal(ro.json.error.details[0].message, 'This field is read-only');
  assertError(await app.request('PATCH', '/api/v1/invoices/5', { body: {} }), 400, 'VALIDATION_ERROR');
  const sent = await app.request('PATCH', '/api/v1/invoices/5', { body: { status: 'SENT' } });
  assert.equal(sent.json.data.status, 'SENT');
  assertError(await app.request('PATCH', '/api/v1/invoices/5', { body: { status: 'DRAFT' } }), 409, 'CONFLICT');
  const paid = await app.request('PATCH', '/api/v1/invoices/5', { body: { status: 'PAID' } });
  assert.equal(paid.json.data.status, 'PAID');
  assertError(await app.request('PATCH', '/api/v1/invoices/5', { body: { dueDate: '2027-02-02' } }), 409, 'CONFLICT');
  assertError(await app.request('DELETE', '/api/v1/invoices/5'), 409, 'CONFLICT');
  assertError(await app.request('PUT', '/api/v1/invoices/9999', { body: { clientId: 1, items: [{ description: 'a', quantity: 1, unitPrice: 1 }], dueDate: '2027-01-01', status: 'DRAFT' } }), 404, 'RESOURCE_NOT_FOUND');
});

test('DELETE invoice: 204 empty body, then 404', async () => {
  const res = await app.request('DELETE', '/api/v1/invoices/3');
  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  assertError(await app.request('GET', '/api/v1/invoices/3'), 404, 'RESOURCE_NOT_FOUND');
  assertError(await app.request('DELETE', '/api/v1/invoices/3'), 404, 'RESOURCE_NOT_FOUND');
});

test('clients CRUD, search, conflicts', async () => {
  const list = await app.request('GET', '/api/v1/clients?limit=5');
  assert.equal(list.json.meta.total, 12);
  assert.equal(list.json.data.length, 5);
  const q = await app.request('GET', '/api/v1/clients?q=lamu');
  assert.equal(q.json.data.length, 1);
  const created = await app.request('POST', '/api/v1/clients', { body: { name: 'Test User', email: 'TEST@Example.com' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.email, 'test@example.com');
  assertError(await app.request('POST', '/api/v1/clients', { body: { name: 'Dup', email: 'test@example.com' } }), 409, 'CONFLICT');
  assertError(await app.request('POST', '/api/v1/clients', { body: { name: '', email: 'nope' } }), 400, 'VALIDATION_ERROR');
  const id = created.json.data.id;
  const patched = await app.request('PATCH', `/api/v1/clients/${id}`, { body: { company: 'Acme' } });
  assert.equal(patched.json.data.company, 'Acme');
  const put = await app.request('PUT', `/api/v1/clients/${id}`, { body: { name: 'Renamed', email: 'test@example.com' } });
  assert.equal(put.json.data.company, undefined);
  assert.equal((await app.request('DELETE', `/api/v1/clients/${id}`)).status, 204);
  assertError(await app.request('GET', `/api/v1/clients/${id}`), 404, 'RESOURCE_NOT_FOUND');
  const withInv = await app.request('DELETE', '/api/v1/clients/1');
  assertError(withInv, 409, 'CONFLICT');
});

test('GET /clients/:id/invoices', async () => {
  const res = await app.request('GET', '/api/v1/clients/1/invoices');
  assert.equal(res.status, 200);
  assert.ok(res.json.data.length > 0 && res.json.data.every((i) => i.clientId === 1));
  assert.equal(res.json.meta.total, res.json.data.length);
  const none = await app.request('GET', '/api/v1/clients/11/invoices');
  assert.deepEqual(none.json.data, []);
  assertError(await app.request('GET', '/api/v1/clients/999/invoices'), 404, 'RESOURCE_NOT_FOUND');
});

test('405 with Allow, unknown routes and versions are 404', async () => {
  const res = await app.request('PUT', '/api/v1/invoices');
  assertError(res, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(res.headers.get('allow'), 'GET, POST');
  assertError(await app.request('GET', '/api/v2/invoices'), 404, 'RESOURCE_NOT_FOUND');
  assertError(await app.request('GET', '/api/v1/nope'), 404, 'RESOURCE_NOT_FOUND');
  assertError(await app.request('GET', '/invoices'), 404, 'RESOURCE_NOT_FOUND');
});

test('auth: 401 missing/invalid, 403 wrong role, 200 admin', async () => {
  const none = await app.request('GET', '/api/v1/admin/stats');
  assertError(none, 401, 'AUTHENTICATION_REQUIRED');
  assert.match(none.headers.get('www-authenticate'), /Bearer/);
  assertError(await app.request('GET', '/api/v1/admin/stats', { headers: { Authorization: 'Bearer wrong' } }), 401, 'AUTHENTICATION_REQUIRED');
  assertError(await app.request('GET', '/api/v1/admin/stats', { headers: { Authorization: 'Basic abc' } }), 401, 'AUTHENTICATION_REQUIRED');
  assertError(await app.request('GET', '/api/v1/admin/stats', { headers: { Authorization: 'Bearer viewer-token-123' } }), 403, 'FORBIDDEN');
  const ok = await app.request('GET', '/api/v1/admin/stats', { headers: { Authorization: 'Bearer admin-token-123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.currency, 'KES');
});

test('docs: /docs serves UI, /docs/json is a valid OpenAPI spec covering every route', async () => {
  const ui = await app.request('GET', '/docs/');
  assert.equal(ui.status, 200);
  assert.match(ui.text, /swagger-ui/i);
  const spec = await app.request('GET', '/docs/json');
  assert.equal(spec.json.info.title, 'Invoice API');
  assert.equal(spec.json.info.version, '1.0.0');
  const SwaggerParser = require('@apidevtools/swagger-parser');
  await SwaggerParser.validate(structuredClone(spec.json));
  const paths = Object.keys(spec.json.paths).sort();
  assert.deepEqual(paths, ['/admin/stats', '/clients', '/clients/{id}', '/clients/{id}/invoices', '/info', '/invoices', '/invoices/{id}']);
  const ops = paths.flatMap((p) => Object.keys(spec.json.paths[p]));
  assert.ok(ops.length >= 4);
});
