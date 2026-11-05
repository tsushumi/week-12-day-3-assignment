'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { AppError } = require('../errors/AppError');
const { errorHandler, HIDDEN_MESSAGE } = require('../middleware/errorHandler');

async function run(isProduction, thrower) {
  const logged = [];
  const app = express();
  app.get('/boom', thrower);
  app.use(errorHandler({ isProduction, logError: (...a) => logged.push(a.join(' ')) }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/boom`);
  const json = await res.json();
  await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  return { status: res.status, json, logged };
}

test('AppError carries code, message, status, details', () => {
  const e = new AppError('CONFLICT', 'm', 409, { a: 1 });
  assert.equal(e.code, 'CONFLICT');
  assert.equal(e.status, 409);
  assert.deepEqual(e.details, { a: 1 });
  assert.ok(e instanceof Error);
});

test('AppError helpers use the required codes', () => {
  assert.equal(AppError.validation([]).code, 'VALIDATION_ERROR');
  assert.equal(AppError.authRequired().status, 401);
  assert.equal(AppError.forbidden().code, 'FORBIDDEN');
  assert.equal(AppError.notFound('Invoice', 7).message, 'Invoice with ID 7 was not found');
  assert.equal(AppError.conflict('x').status, 409);
  assert.equal(AppError.internal().code, 'INTERNAL_ERROR');
});

test('unexpected error: real message in development, hidden in production, stack always logged', async () => {
  const thrower = () => { throw new Error('db password is hunter2'); };
  const dev = await run(false, thrower);
  assert.equal(dev.status, 500);
  assert.equal(dev.json.error.code, 'INTERNAL_ERROR');
  assert.equal(dev.json.error.message, 'db password is hunter2');
  const prod = await run(true, thrower);
  assert.equal(prod.status, 500);
  assert.equal(prod.json.error.message, HIDDEN_MESSAGE);
  assert.ok(!JSON.stringify(prod.json).includes('hunter2'));
  assert.deepEqual(Object.keys(prod.json.error), ['code', 'message', 'status', 'details']);
  assert.ok(prod.logged.some((l) => l.includes('hunter2') && l.includes('at ')), 'stack logged server-side');
});

test('async rejection and non-Error throws are handled', async () => {
  const a = await run(true, async () => { throw new Error('async fail'); });
  assert.equal(a.status, 500);
  const b = await run(true, () => { throw 'a string'; }); // eslint-disable-line no-throw-literal
  assert.equal(b.status, 500);
  assert.equal(b.json.error.code, 'INTERNAL_ERROR');
});
