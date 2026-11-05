'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

test('default limit is 100/15min: headers on every response, 101st request is 429', async () => {
  const app = await startApp();
  try {
    const first = await app.request('GET', '/api/v1/info');
    assert.equal(first.headers.get('x-ratelimit-limit'), '100');
    assert.equal(first.headers.get('x-ratelimit-remaining'), '99');
    const reset = Number(first.headers.get('x-ratelimit-reset'));
    const nowSec = Date.now() / 1000;
    assert.ok(reset > nowSec && reset <= nowSec + 15 * 60 + 2, `reset is Unix seconds ~15min ahead: ${reset}`);
    for (let i = 2; i <= 99; i++) await app.request('GET', '/api/v1/info');
    const hundredth = await app.request('GET', '/api/v1/info');
    assert.equal(hundredth.status, 200);
    assert.equal(hundredth.headers.get('x-ratelimit-remaining'), '0');
    const blocked = await app.request('GET', '/api/v1/invoices');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(blocked.json.error.status, 429);
    assert.equal(blocked.json.error.details.limit, 100);
    assert.equal(blocked.json.error.details.window, '15 minutes');
    const ra = Number(blocked.headers.get('retry-after'));
    assert.ok(ra > 0 && ra <= 900);
    assert.equal(blocked.json.error.details.retryAfter, ra);
    assert.equal(blocked.headers.get('x-ratelimit-remaining'), '0');
    assert.equal(blocked.headers.get('x-ratelimit-limit'), '100');
  } finally { await app.close(); }
});

test('limits are per X-API-Key; keyless requests share the IP bucket; /health and /docs are not limited', async () => {
  const app = await startApp({ env: { RATE_LIMIT_MAX: '3' } });
  try {
    const a = { 'X-API-Key': 'key-aaaaaaaa' };
    const b = { 'X-API-Key': 'key-bbbbbbbb' };
    for (let i = 0; i < 3; i++) assert.equal((await app.request('GET', '/api/v1/info', { headers: a })).status, 200);
    assert.equal((await app.request('GET', '/api/v1/info', { headers: a })).status, 429);
    const other = await app.request('GET', '/api/v1/info', { headers: b });
    assert.equal(other.status, 200);
    assert.equal(other.headers.get('x-ratelimit-remaining'), '2');
    for (let i = 0; i < 3; i++) assert.equal((await app.request('GET', '/api/v1/info')).status, 200);
    assert.equal((await app.request('GET', '/api/v1/info')).status, 429);
    assert.equal((await app.request('GET', '/health')).status, 200);
    assert.equal((await app.request('GET', '/docs/json')).status, 200);
  } finally { await app.close(); }
});

test('malformed keys fall back to IP; rotating keys cannot dodge the per-IP ceiling', async () => {
  const app = await startApp({ env: { RATE_LIMIT_MAX: '2', RATE_LIMIT_IP_CEILING: '5' } });
  try {
    for (let i = 0; i < 2; i++) await app.request('GET', '/api/v1/info', { headers: { 'X-API-Key': 'short' } });
    assert.equal((await app.request('GET', '/api/v1/info', { headers: { 'X-API-Key': 'short' } })).status, 429);
  } finally { await app.close(); }
  const app2 = await startApp({ env: { RATE_LIMIT_MAX: '2', RATE_LIMIT_IP_CEILING: '5' } });
  try {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await app2.request('GET', '/api/v1/info', { headers: { 'X-API-Key': `rotating-key-${i}` } })).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
  } finally { await app2.close(); }
});

test('window resets after windowMs', async () => {
  const app = await startApp({ env: { RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '1000' } });
  try {
    await app.request('GET', '/api/v1/info');
    await app.request('GET', '/api/v1/info');
    const blocked = await app.request('GET', '/api/v1/info');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.error.details.window, '1 second');
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal((await app.request('GET', '/api/v1/info')).status, 200);
  } finally { await app.close(); }
});

test('malformed bodies still count against the limit (limiter runs before the parser)', async () => {
  const app = await startApp({ env: { RATE_LIMIT_MAX: '2' } });
  try {
    for (let i = 0; i < 2; i++) await app.request('POST', '/api/v1/invoices', { raw: '{bad', headers: { 'Content-Type': 'application/json' } });
    assert.equal((await app.request('GET', '/api/v1/info')).status, 429);
  } finally { await app.close(); }
});
