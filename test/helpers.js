'use strict';

const { loadConfig } = require('../config');
const { createApp } = require('../app');

// Starts an isolated app (fresh seed data, fresh rate-limit counters) on an ephemeral port.
async function startApp({ env = {}, logError = () => {} } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  const app = createApp({ config, logError });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, headers = {}, raw } = {}) {
    const init = { method, headers: { ...headers } };
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: res.status, headers: res.headers, text, json };
  }

  return { base, config, request, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

const validInvoice = (over = {}) => ({
  clientId: 1,
  items: [{ description: 'Consulting', quantity: 2, unitPrice: 1500.5 }],
  dueDate: '2026-12-31',
  ...over,
});

module.exports = { startApp, validInvoice };
