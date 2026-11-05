'use strict';

const { loadConfig } = require('./config');
const { createApp } = require('./app');

const config = loadConfig();
const app = createApp({
  config,
  log: (line) => console.log(line),
  logError: (...args) => console.error(...args),
});

const server = app.listen(config.port, () => {
  console.log(`Invoice API v${config.version} listening on http://localhost:${config.port}${config.prefix}`);
  console.log(`Docs: http://localhost:${config.port}/docs`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
