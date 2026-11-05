'use strict';

const express = require('express');
const { createInfoRouter } = require('./info');
const { createInvoiceRouter } = require('./invoices');
const { createClientRouter } = require('./clients');
const { createAdminRouter } = require('./admin');

// Everything under /api/v1. Mounted in app.js with app.use('/api/v1', v1Router).
function createV1Router({ services, config }) {
  const router = express.Router();
  router.use(createInfoRouter({ config }));
  router.use(createInvoiceRouter(services));
  router.use(createClientRouter(services));
  router.use(createAdminRouter({ services, config }));
  return router;
}

module.exports = { createV1Router };
