'use strict';

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { configureZod } = require('./utils/zod');
const { createStore } = require('./data/store');
const { createServices } = require('./services');
const { createV1Router } = require('./routes/v1');
const { buildSpec } = require('./docs/openapi');
const { requestId } = require('./middleware/requestId');
const { requestLogger } = require('./middleware/requestLogger');
const { createRateLimiters } = require('./middleware/rateLimit');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');

configureZod();

function createApp({ config, store = createStore(), log = () => {}, logError = () => {} }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy !== false) app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  app.use(requestLogger(log));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(
    cors({
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After', 'Location', 'X-Request-Id'],
    })
  );

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Interactive documentation. /docs/json must be registered before /docs.
  const spec = buildSpec();
  app.get('/docs/json', (req, res) => res.json(spec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Invoice API docs' }));

  const services = createServices(store);
  const v1Router = createV1Router({ services, config });

  // Rate limiters run BEFORE the body parser so malformed or oversized bodies are counted too.
  app.use(config.prefix, ...createRateLimiters(config.rateLimit));
  app.use(config.prefix, express.json({ limit: '100kb' }));
  app.use(config.prefix, v1Router);

  app.use(notFound);
  app.use(errorHandler({ isProduction: config.isProduction, logError }));
  return app;
}

module.exports = { createApp };
